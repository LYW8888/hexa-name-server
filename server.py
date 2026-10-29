"""Local server for 序名; four pillars and candidate suggestions are distinct."""
from __future__ import annotations
import json, os, re, sqlite3
from datetime import date, datetime, time
from zoneinfo import ZoneInfo
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
import bazi

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
DB = DATA / "naming.sqlite3"
# Only assets required by the application are public. In particular, never
# expose the SQLite database, source files, repository metadata or directories.
PUBLIC_ASSETS = frozenset({
    "/", "/index.html", "/styles.css", "/engine.js", "/app.js",
    "/service-worker.js", "/manifest.webmanifest",
    "/data/character-catalog.json", "/data/classics.json", "/data/product.json",
})
ZONE_LABELS = {
    "Asia/Shanghai": "中国标准时间 UTC+8",
    "Asia/Taipei": "台北时间 UTC+8",
    "Asia/Hong_Kong": "香港时间 UTC+8",
}

def valid_source(source) -> bool:
    """A verified label requires traceable metadata, plus actual human review."""
    if not isinstance(source, dict) or not isinstance(source.get("description"), str) or not source["description"].strip():
        return False
    status = source.get("verification_status")
    if status in ("demo", "pending"):
        return True
    if status != "verified":
        return False
    reference = source.get("reference")
    if not isinstance(reference, dict):
        return False
    fields = ("title", "edition", "citation", "license", "reviewed_by", "reviewed_at", "url")
    if any(not isinstance(reference.get(key), str) or not reference[key].strip() for key in fields):
        return False
    url = urlparse(reference["url"])
    if url.scheme not in ("https", "http") or not url.netloc:
        return False
    try:
        date.fromisoformat(reference["reviewed_at"])
    except ValueError:
        return False
    return True

def load_names() -> list[dict]:
    """Load the single candidate catalog, rejecting incomplete or duplicated data."""
    data = json.loads((DATA / "names.json").read_text(encoding="utf-8"))
    names = data.get("names")
    if not isinstance(names, list) or not names:
        raise ValueError("candidate catalog is empty or invalid")
    seen = set()
    for item in names:
        given = item.get("given")
        source = item.get("meaning_source", {})
        associations = item.get("demo_associations")
        if (not isinstance(given, str) or not 1 <= len(given) <= 3 or given in seen
            or not isinstance(item.get("pinyin"), str) or not item["pinyin"]
            or not isinstance(item.get("meaning"), str) or not item["meaning"]
            or not isinstance(item.get("tags"), list) or not item["tags"]
            or any(not isinstance(tag, str) for tag in item["tags"])
            or not isinstance(item.get("styles"), list) or any(not isinstance(style, str) for style in item["styles"])
            or not isinstance(item.get("genders"), list) or any(g not in ("unknown", "male", "female") for g in item["genders"])
            or not isinstance(item.get("base_score"), int) or not 0 <= item["base_score"] <= 99
            or not valid_source(source)
            or (associations is not None and (not isinstance(associations, dict) or associations.get("verification_status") != "demo" or not associations.get("gua")
            or not associations.get("gua_meaning") or not isinstance(associations.get("strokes"), int)))):
            raise ValueError(f"candidate catalog contains invalid record: {given!r}")
        seen.add(given)
    return names


def init_db() -> None:
    # Keep the existing SQLite catalog for compatibility; the checked-in JSON
    # is the authoritative source for both selection and presentation.
    DATA.mkdir(exist_ok=True)
    rows = [(item["given"], item["meaning"], item["tags"][0], ",".join(item["styles"]), item["base_score"]) for item in load_names()]
    with sqlite3.connect(DB) as conn:
        conn.execute("CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        conn.execute("CREATE TABLE IF NOT EXISTS candidates (given TEXT PRIMARY KEY, meaning TEXT, element TEXT, styles TEXT, base_score INTEGER)")
        conn.executemany("INSERT OR REPLACE INTO candidates VALUES (?,?,?,?,?)", rows)
        conn.execute("INSERT OR REPLACE INTO metadata VALUES (?,?)", ("schema_version", "1.0.0"))
        conn.commit()

def character_preferences(payload: dict) -> tuple[set[str], set[str]]:
    """Explicit fields are individual Chinese characters separated by punctuation.

    The previous free-text field remains supported for older API clients.
    """
    def parse_field(key: str) -> set[str]:
        value = payload.get(key, "") or ""
        if not isinstance(value, str) or len(value) > 100:
            raise ValueError(f"{key} must contain Chinese characters and separators only")
        chars = set()
        for char in value:
            code = ord(char)
            if 0x3400 <= code <= 0x9fff or 0x20000 <= code <= 0x323af:
                chars.add(char)
            elif not (char.isspace() or char in "，,、；;‘’“”'\"：:"):
                raise ValueError(f"{key} must contain Chinese characters and separators only")
        return chars

    legacy = str(payload.get("chars", "") or "")
    def legacy_field(words: str) -> set[str]:
        found = set()
        for match in re.finditer(rf"(?:{words})[：:\s‘“\"']*([^，,；;\s]+)", legacy):
            found.update(char for char in match.group(1) if 0x3400 <= ord(char) <= 0x9fff)
        return found

    liked = parse_field("likedChars") if "likedChars" in payload else legacy_field("喜欢|喜歡")
    avoided = parse_field("avoidedChars") if "avoidedChars" in payload else legacy_field("避开|避開|不要|不取")
    if liked & avoided:
        raise ValueError("likedChars and avoidedChars cannot overlap")
    return liked, avoided

def analyze(payload: dict) -> dict:
    surname = str(payload.get("surname", "")).strip()
    if not surname or len(surname) > 2:
        raise ValueError("surname must contain one or two characters")
    mode = str(payload.get("mode", "due_date"))
    if mode not in ("due_date", "born"):
        raise ValueError("mode must be due_date or born")
    purpose = str(payload.get("purpose", "newborn"))
    if purpose not in ("newborn", "rename"):
        raise ValueError("purpose must be newborn or rename")
    if purpose == "rename" and mode != "born":
        raise ValueError("rename purpose requires born mode")
    gender = str(payload.get("gender", "unknown"))
    if gender not in ("male", "female", "unknown"):
        raise ValueError("gender must be male, female, or unknown")
    zone = str(payload.get("zone", "Asia/Shanghai"))
    if zone not in ZONE_LABELS:
        raise ValueError("zone must be Asia/Shanghai, Asia/Taipei, or Asia/Hong_Kong")
    zone_label = ZONE_LABELS[zone]

    # Keep both dates when supplied. `date`/`time` remain accepted for old clients.
    due_date = str(payload.get("dueDate") or (payload.get("date") if mode == "due_date" else "") or "").strip()
    due_time = str(payload.get("dueTime") or (payload.get("time") if mode == "due_date" else "") or "12:00").strip()
    birth_date = str(payload.get("birthDate") or (payload.get("date") if mode == "born" else "") or "").strip()
    birth_time = str(payload.get("birthTime") or (payload.get("time") if mode == "born" else "") or "").strip()

    if mode == "due_date" and not due_date:
        raise ValueError("dueDate is required when using due date mode")
    if mode == "born" and (not birth_date or not birth_time):
        raise ValueError("birthDate and exact birthTime are required when already born")
    if birth_date and not birth_time:
        raise ValueError("birthDate and birthTime must be supplied together")
    if birth_time and not birth_date:
        raise ValueError("birthDate and birthTime must be supplied together")
    if due_date:
        date.fromisoformat(due_date)  # Future due dates are valid.
        if not re.fullmatch(r"(?:[01][0-9]|2[0-3]):[0-5][0-9]", due_time):
            raise ValueError("dueTime must use HH:MM format")
    if birth_date:
        parsed_birth = date.fromisoformat(birth_date)
        now_in_zone = datetime.now(ZoneInfo(zone))
        if parsed_birth > now_in_zone.date():
            raise ValueError("actual birth date cannot be in the future")
        if not re.fullmatch(r"(?:[01][0-9]|2[0-3]):[0-5][0-9]", birth_time):
            raise ValueError("birthTime must use HH:MM format")
        parsed_birth_time = time.fromisoformat(birth_time)
        if parsed_birth == now_in_zone.date() and parsed_birth_time > now_in_zone.time().replace(second=0, microsecond=0):
            raise ValueError("birthTime cannot be in the future")

    actual_complete = bool(birth_date and birth_time)
    basis_date = birth_date if actual_complete else due_date
    basis_time = birth_time if actual_complete else due_time
    try:
        length = int(payload.get("length", 2))
    except (TypeError, ValueError) as exc:
        raise ValueError("length must be 1, 2, or 3") from exc
    if length not in (1, 2, 3):
        raise ValueError("length must be 1, 2, or 3")
    try:
        candidate_count = int(payload.get("candidateCount", payload.get("count", 3)))
    except (TypeError, ValueError) as exc:
        raise ValueError("candidateCount must be an integer from 1 to 11") from exc
    if candidate_count < 1 or candidate_count > 11:
        raise ValueError("candidateCount must be an integer from 1 to 11")
    place = str(payload.get("place", "")).strip()
    if not place:
        raise ValueError("place is required")
    parents = str(payload.get("parents", "")).strip()
    current_name = str(payload.get("currentName", "")).strip()
    if len(current_name) > 20:
        raise ValueError("currentName must be 20 characters or fewer")
    meaning = str(payload.get("meaning", "")).strip()
    liked, avoided = character_preferences(payload)
    styles = payload.get("styles", []) or []
    if not isinstance(styles, list) or any(not isinstance(style, str) for style in styles):
        raise ValueError("styles must be a list of strings")
    chart = bazi.calculate(basis_date, basis_time, zone, reference=not actual_complete)
    scenario = "已出生准确时间" if actual_complete and mode == "born" else "预产期参考 + 已出生信息" if actual_complete else "预产期参考"
    purpose_label = "成人改名" if purpose == "rename" else "新生儿起名"
    names = load_names()
    pool = [item for item in names if len(item["given"]) == length and not any(char in avoided for char in item["given"])]
    effective_count = min(candidate_count, len(pool))
    try:
        variant = int(payload.get("variant", 0))
    except (TypeError, ValueError) as exc:
        raise ValueError("variant must be an integer from 0 to 100000") from exc
    if not 0 <= variant <= 100000:
        raise ValueError("variant must be an integer from 0 to 100000")
    result = []
    for item in pool:
        given = item["given"]
        base = item["base_score"]
        gender_boost = 2 if gender == "unknown" or gender in item["genders"] else 0
        preference_boost = 2 if any(char in meaning or char in liked for char in given) else 0
        style_boost = 2 if set(styles) & set(item["styles"]) else 0
        score = base + style_boost + gender_boost + preference_boost
        evidence = f"演示评分构成：基础 {base}；风格偏好 +{style_boost}；性别倾向 +{gender_boost}；文字偏好 +{preference_boost}。重新生成时轮换候选；避用字已过滤；未计算喜用神。"
        assoc = item["demo_associations"]
        if assoc:
            polarity = "阴" if assoc["strokes"] % 2 == 0 else "阳"
            gua_evidence = f"演示库人工关联的八卦象意：{assoc['gua']}卦，{assoc['gua_meaning']}。并非依出生信息起卦；《周易·说卦传》来源及释义待核验。"
            yinyang_evidence = f"演示笔画奇偶参考：候选名暂记 {assoc['strokes']} 画，按奇偶标为{polarity}；笔画和对应规则均待核验，不能用于判断运势。"
        else:
            gua_evidence = "尚无经核验的卦象资料；并非依出生信息起卦。"
            yinyang_evidence = "尚无经核验的笔画和阴阳资料。"
        source = item["meaning_source"]
        reference = source.get("reference") if source["verification_status"] == "verified" else None
        source_text = source["description"] if not reference else f"{source['description']}（{reference['title']}，{reference['edition']}，{reference['citation']}；复核：{reference['reviewed_by']}，{reference['reviewed_at']}）"
        result.append({"name": surname + given, "given": given, "pinyin": item["pinyin"], "meaning": item["meaning"], "tags": item["tags"], "element": item["tags"][0], "score": max(0, min(score, 99)), "score_evidence": evidence, "source_status": source["verification_status"], "source": source_text, "source_reference": reference, "element_evidence": f"演示字库意象分类：{item['tags'][0]}；归类尚未核验，不代表生辰五行。", "gua_evidence": gua_evidence, "yinyang_evidence": yinyang_evidence})
    result.sort(key=lambda item: (-item["score"], item["given"]))
    if variant and result:
        offset = (variant * effective_count) % len(result)
        result = result[offset:] + result[:offset]
    gender_label = {"male": "男", "female": "女", "unknown": "未知"}[gender]
    method = (f"{'预产期参考排盘，出生后请以实际出生时间重新计算' if chart['reference'] else '按实际出生日期和时间排盘'}；"
              f"时区：{zone_label}；年柱以立春、月柱以十二节的交接时刻为界；"
              "日柱以当地民用时间 23:00 换日。五行仅统计四柱表面八字，不含藏干，不判定旺衰或喜用神；"
              "候选名评分及字的五行归类仍为待核验的演示规则。")
    return {"analysis": {"primary": None, "support": None, "bazi": chart, "family": bool(parents), "purpose": purpose_label, "current_name": current_name, "scenario": scenario, "gender": gender_label, "zone": zone, "zone_label": zone_label, "time": basis_time, "due_date": due_date, "due_time": due_time if due_date else "", "birth_date": birth_date, "birth_time": birth_time, "candidate_count": effective_count, "requested_candidate_count": candidate_count, "available_candidate_count": len(pool), "method": method}, "candidates": result[:effective_count]}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_head(self):
        # Both GET and HEAD use this method; do not allow directory listings or
        # decoded path aliases to bypass the same explicit allowlist.
        if urlparse(self.path).path not in PUBLIC_ASSETS:
            self.send_error(404)
            return None
        return super().send_head()

    def end_headers(self):
        # The service worker handles its own versioned asset cache. API results
        # may contain birth data and should not be stored by HTTP caches.
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()

    def do_GET(self):
        route = urlparse(self.path).path
        if route == "/api/health": return self.json({"status": "ok", "database": DB.name})
        if route == "/api/name-counts":
            names = load_names()
            return self.json({"counts": {str(length): sum(len(item["given"]) == length for item in names) for length in (1, 2, 3)}})
        if route == "/api/catalog":
            return self.json(json.loads((DATA / "character-catalog.json").read_text(encoding="utf-8")))
        if route == "/api/classics":
            return self.json(json.loads((DATA / "classics.json").read_text(encoding="utf-8")))
        if route == "/api/product":
            return self.json(json.loads((DATA / "product.json").read_text(encoding="utf-8")))
        return super().do_GET()
    def do_POST(self):
        if urlparse(self.path).path != "/api/analyze":
            return self.send_error(404)
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size < 0: raise ValueError("invalid Content-Length")
            if size > 64 * 1024: raise ValueError("request too large")
            payload = json.loads(self.rfile.read(size) or b"{}")
            if not isinstance(payload, dict): raise ValueError("request body must be a JSON object")
            return self.json(analyze(payload))
        except (ValueError, json.JSONDecodeError) as exc:
            return self.json({"error": str(exc)}, 400)
    def json(self, body, status=200):
        raw = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status); self.send_header("Content-Type", "application/json; charset=utf-8"); self.send_header("Content-Length", str(len(raw))); self.end_headers(); self.wfile.write(raw)
    def log_message(self, fmt, *args):
        if os.environ.get("NAME_SERVER_LOG", ""):
            super().log_message(fmt, *args)

if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", "4173"))
    host = os.environ.get("HOST", "0.0.0.0")
    ThreadingHTTPServer((host, port), Handler).serve_forever()
