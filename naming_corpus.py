"""Reproducible, versioned import of uploaded texts and selected naming evidence."""
from __future__ import annotations
from functools import lru_cache
from pathlib import Path
from html import unescape
import fcntl
import hashlib
import json
import os
import re
import sqlite3
import tempfile
import threading

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'data' / 'naming'
DB = ROOT / 'data' / 'naming-corpus.sqlite3'
_LOCK = threading.RLock()
SCHEMA = 'naming-corpus-v1.1'


def _json(name):
    return json.loads((DATA / name).read_text(encoding='utf-8'))


def fingerprint():
    digest = hashlib.sha256(SCHEMA.encode())
    for path in sorted(DATA.rglob('*')):
        if path.is_file():
            digest.update(str(path.relative_to(DATA)).encode())
            digest.update(path.read_bytes())
    return digest.hexdigest()


def clean_text(value):
    value = unescape(value)
    value = re.sub(r'<[^>]*>', ' ', value)
    return value.replace('\ufeff', '').strip()


def parse_dictionary(text):
    pattern = re.compile(r'^【([^】]+)】([^\n]+?)\s+部首：([^\s]+)\s+康熙笔画：(\d+)[ \t]*$', re.M)
    matches = list(pattern.finditer(text))
    result = []
    for i, match in enumerate(matches):
        body = text[match.end():matches[i+1].start() if i+1 < len(matches) else len(text)].strip()
        body = re.sub(r'（内容由AI生成，仅供参考）\s*$', '', body)
        char = match[1]
        if len(char) != 1 or not body:
            raise ValueError('dictionary record is incomplete')
        result.append(dict(char=char, traditional=match[2].strip(), radical=match[3],
                           strokes=int(match[4]), definition=clean_text(body),
                           line=text.count('\n', 0, match.start())+1))
    if len({r['char'] for r in result}) != len(result) or not result:
        raise ValueError('dictionary must contain unique characters')
    return result


def parse_passages(text):
    chapter = '未分篇'
    for number, raw in enumerate(text.splitlines(), 1):
        line = raw.replace('\ufeff', '').strip()
        if not line or line.startswith('#') or '内容由AI生成' in line:
            continue
        title = re.match(r'^【([^】]+)】', line)
        if title:
            chapter = title[1]
            line = line[title.end():].strip()
        if line:
            yield chapter, number, line


def build_database(target=DB):
    """Build beside the destination, validate fully, then atomically replace it."""
    target = Path(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    manifest = _json('sources.json')
    sources = {s['id']: s for s in manifest['sources']}
    corpus = {}
    for source in sources.values():
        raw = (DATA / 'raw' / source['file']).read_bytes()
        if hashlib.sha256(raw).hexdigest() != source['sha256']:
            raise ValueError('corpus hash mismatch: ' + source['id'])
        corpus[source['id']] = raw.decode('utf-8-sig').replace('\r\n', '\n')
    phrases = _json('phrases.json')['phrases']
    profiles = _json('positive-characters.json')['characters']
    passages = {(sid, line): (chapter, text) for sid, text in corpus.items()
                if sid != 'kangxi' for chapter, line, text in parse_passages(text)}
    for item in phrases + profiles:
        if item['source_id'] not in sources or not sources[item['source_id']]['naming_enabled']:
            raise ValueError('naming evidence refers to a quarantined source')
        passage = passages.get((item['source_id'], item['line']))
        if not passage or passage[0] != item['chapter'] or item['quote'] not in passage[1]:
            raise ValueError('quote does not match uploaded passage: ' + item.get('given', item.get('char', '')))
        if any(c not in item['quote'] for c in item.get('given', item.get('char', ''))):
            raise ValueError('selected character not present in quote')
    entries = parse_dictionary(corpus['kangxi'])
    fd, temporary = tempfile.mkstemp(prefix=target.name + '.', suffix='.tmp', dir=target.parent)
    os.close(fd)
    try:
        with sqlite3.connect(temporary) as conn:
            conn.executescript('''
                CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
                CREATE TABLE sources(id TEXT PRIMARY KEY,title TEXT NOT NULL,filename TEXT NOT NULL,sha256 TEXT NOT NULL,naming_enabled INTEGER NOT NULL);
                CREATE TABLE passages(source_id TEXT NOT NULL,chapter TEXT NOT NULL,line INTEGER NOT NULL,text TEXT NOT NULL,PRIMARY KEY(source_id,line),FOREIGN KEY(source_id) REFERENCES sources(id));
                CREATE INDEX passage_chapter ON passages(source_id,chapter);
                CREATE TABLE characters(char TEXT PRIMARY KEY,traditional TEXT NOT NULL,radical TEXT NOT NULL,strokes INTEGER NOT NULL CHECK(strokes>0),definition TEXT NOT NULL,line INTEGER NOT NULL);
                CREATE TABLE phrases(id INTEGER PRIMARY KEY,given TEXT NOT NULL,data TEXT NOT NULL);
                CREATE TABLE positive_characters(char TEXT PRIMARY KEY,data TEXT NOT NULL);
            ''')
            conn.execute('PRAGMA foreign_keys=ON')
            conn.executemany('INSERT INTO sources VALUES(?,?,?,?,?)', [(s['id'],s['title'],s['file'],s['sha256'],int(s['naming_enabled'])) for s in sources.values()])
            conn.executemany('INSERT INTO passages VALUES(?,?,?,?)',[(sid,chapter,line,text) for (sid,line),(chapter,text) in passages.items()])
            conn.executemany('INSERT INTO characters VALUES(?,?,?,?,?,?)',[(r['char'],r['traditional'],r['radical'],r['strokes'],r['definition'],r['line']) for r in entries])
            conn.executemany('INSERT INTO phrases(given,data) VALUES(?,?)',[(r['given'],json.dumps(r,ensure_ascii=False)) for r in phrases])
            conn.executemany('INSERT INTO positive_characters VALUES(?,?)',[(r['char'],json.dumps(r,ensure_ascii=False)) for r in profiles])
            conn.executemany('INSERT INTO metadata VALUES(?,?)',[('schema',SCHEMA),('fingerprint',fingerprint())])
            conn.commit()
            if conn.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise ValueError('corpus database integrity check failed')
        # Reference data contains no customer records; isolated readers need read access.
        os.chmod(temporary, 0o644)
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return dict(characters=len(entries), positive_characters=len(profiles), phrases=len(phrases),
                passages=len(passages), documents=len(sources), fingerprint=fingerprint())


def _current_database():
    if not DB.is_file():
        return False
    try:
        with sqlite3.connect(DB.resolve().as_uri()+'?mode=ro',uri=True) as conn:
            return conn.execute("SELECT value FROM metadata WHERE key='fingerprint'").fetchone() == (fingerprint(),)
    except sqlite3.DatabaseError:
        return False


@lru_cache(maxsize=1)
def snapshot():
    with _LOCK:
        # Customer and delivery processes read a prebuilt reference database.
        # They must not need write access to the naming application's directory.
        if not _current_database():
            with open(str(DB)+'.lock', 'a') as lock:
                fcntl.flock(lock, fcntl.LOCK_EX)
                if not _current_database():
                    build_database()
        with sqlite3.connect(DB.resolve().as_uri()+'?mode=ro',uri=True) as conn:
            conn.row_factory = sqlite3.Row
            characters = {row['char']: dict(row) for row in conn.execute('SELECT * FROM characters')}
            phrases = [json.loads(row[0]) for row in conn.execute('SELECT data FROM phrases ORDER BY id')]
            profiles = {row['char']:json.loads(row['data']) for row in conn.execute('SELECT * FROM positive_characters ORDER BY char')}
            sources = {row['id']:dict(row) for row in conn.execute('SELECT * FROM sources')}
            count = conn.execute('SELECT count(*) FROM passages').fetchone()[0]
        return dict(characters=characters, phrases=phrases, profiles=profiles, sources=sources,
                    rules=_json('rules.json'), surname_readings=_json('surname-readings.json'),
                    version=_json('sources.json')['version'], fingerprint=fingerprint(), passage_count=count)


def public_stats():
    value = snapshot()
    return dict(version=value['version'], fingerprint=value['fingerprint'], documents=len(value['sources']),
                character_records=len(value['characters']), positive_characters=len(value['profiles']),
                selected_phrases=len(value['phrases']), passages=value['passage_count'],
                provenance='上传原文逐条匹配；正向义项为项目编辑选择，匹配值不表示运势。')


def evidence(item):
    source = snapshot()['sources'][item['source_id']]
    return dict(source_id=source['id'], work=source['title'], chapter=item['chapter'],
                quote=item['quote'], line=item['line'], sha256=source['sha256'], status='text_matched')
