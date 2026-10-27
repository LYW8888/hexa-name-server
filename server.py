"""Zero-dependency local server for the 序名 MVP.

The calculation endpoint is deliberately a transparent demo rule. Replace the
rule function with a verified calendar/four-pillars provider before production.
"""
from __future__ import annotations
import json, os, re, sqlite3
from datetime import date
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
DB = DATA / "naming.sqlite3"
ELEMENTS = ("木", "火", "土", "金", "水")
CANDIDATES = (
    ("知衡", "知其所来，守心而衡；清醒而有分寸。", "木", "classical,bright", 94),
    ("景和", "景是光明与敬意，和是从容与相处。", "火", "classical,bright", 92),
    ("予安", "予人以善意，也为自己留一方安定。", "土", "classical,modern", 90),
    ("清晏", "清澈而坚定，晏然自得，心有晴明。", "水", "classical,nature", 89),
    ("言川", "言有所守，心有远川；诚实而开阔。", "水", "modern,nature", 88),
    ("昭宁", "昭示光亮，宁静笃定，温柔而有力量。", "火", "classical,bright", 87),
    ("安", "安定、从容，也保留给未来的空间。", "土", "modern,classical", 86),
    ("澄", "澄明而不喧，保有清醒和宁静。", "水", "modern,nature", 85),
    ("知行", "知与行相互照见，把理解带入生活。", "木", "classical,bright", 91),
    ("景和安", "有光明、有和意，也有安定的落点。", "火", "classical,bright", 88),
    ("清晏宁", "清澈、安宁而坚定，温柔中有力量。", "水", "classical,nature", 87),
)

GENDER_BY_GIVEN = {
    '知衡': {'unknown', 'male'}, '景和': {'unknown', 'male', 'female'}, '予安': {'unknown', 'female'},
    '清晏': {'unknown', 'female'}, '言川': {'unknown', 'male'}, '昭宁': {'unknown', 'female'},
    '安': {'unknown', 'male', 'female'}, '澄': {'unknown', 'male', 'female'}, '知行': {'unknown', 'male'},
    '景和安': {'unknown', 'male', 'female'}, '清晏宁': {'unknown', 'female'}
}

def init_db() -> None:
    DATA.mkdir(exist_ok=True)
    with sqlite3.connect(DB) as conn:
        conn.execute("CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        conn.execute("CREATE TABLE IF NOT EXISTS candidates (given TEXT PRIMARY KEY, meaning TEXT, element TEXT, styles TEXT, base_score INTEGER)")
        conn.executemany("INSERT OR REPLACE INTO candidates VALUES (?,?,?,?,?)", CANDIDATES)
        conn.execute("INSERT OR REPLACE INTO metadata VALUES (?,?)", ("schema_version", "0.1.0"))
        conn.commit()

def text_score(value: str) -> int:
    return sum(ord(char) for char in value or "")

def analyze(payload: dict) -> dict:
    surname = str(payload.get("surname", "")).strip()
    if not surname or len(surname) > 2:
        raise ValueError("surname must contain one or two characters")
    mode = str(payload.get("mode", "due_date"))
    if mode not in ("due_date", "born"):
        raise ValueError("mode must be due_date or born")
    gender = str(payload.get("gender", "unknown"))
    if gender not in ("male", "female", "unknown"):
        raise ValueError("gender must be male, female, or unknown")

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
    if birth_date:
        parsed_birth = date.fromisoformat(birth_date)
        if parsed_birth > date.today():
            raise ValueError("actual birth date cannot be in the future")

    actual_complete = bool(birth_date and birth_time)
    basis_date = birth_date if actual_complete else due_date
    basis_time = birth_time if actual_complete else due_time
    length = int(payload.get("length", 2))
    if length not in (1, 2, 3):
        raise ValueError("length must be 1, 2, or 3")
    place = str(payload.get("place", "")).strip()
    parents = str(payload.get("parents", "")).strip()
    styles = payload.get("styles", []) or []
    if not isinstance(styles, list):
        styles = []
    seed = sum(int(x) for x in re.findall(r"\d", basis_date + basis_time)) + text_score(place) + text_score(parents)
    primary, support = ELEMENTS[seed % 5], ELEMENTS[(seed + 2) % 5]
    scenario = "已出生准确时间" if actual_complete and mode == "born" else "预产期参考 + 已出生信息" if actual_complete else "预产期参考"
    with sqlite3.connect(DB) as conn:
        rows = conn.execute("SELECT given, meaning, element, styles, base_score FROM candidates").fetchall()
    exact = [row for row in rows if len(row[0]) == length]
    pool = exact or rows
    result = []
    for given, meaning, element, candidate_styles, base in pool:
        gender_boost = 2 if gender == "unknown" or gender in GENDER_BY_GIVEN.get(given, {"unknown"}) else 0
        score = base + (2 if element == primary else 0) + (2 if set(styles) & set(candidate_styles.split(",")) else 0) + (1 if parents and element == support else 0) + gender_boost
        result.append({"name": surname + given, "given": given, "meaning": meaning, "element": element, "score": min(score, 99), "source_status": "demo"})
    result.sort(key=lambda item: (-item["score"], item["given"]))
    gender_label = {"male": "男", "female": "女", "unknown": "未知"}[gender]
    method = f"演示规则：以{'实际出生日期和准确时间' if actual_complete else '预产期和参考时间'}作为主要计算输入；{f'预产期为 {due_date} {due_time}' if due_date else '未填写预产期'}；{f'出生信息为 {birth_date} {birth_time}' if birth_date else '尚未填写实际出生信息'}；{'已纳入父母姓氏线索' if parents else '未填写父母姓氏'}；性别偏好为{gender_label}。正式版本需要经核验的历法服务。"
    return {"analysis": {"primary": primary, "support": support, "family": bool(parents), "scenario": scenario, "gender": gender_label, "time": basis_time, "due_date": due_date, "due_time": due_time if due_date else "", "birth_date": birth_date, "birth_time": birth_time, "method": method}, "candidates": result[:6]}

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        route = urlparse(self.path).path
        if route == "/api/health": return self.json({"status": "ok", "database": DB.name})
        if route == "/api/catalog":
            return self.json(json.loads((DATA / "character-catalog.json").read_text(encoding="utf-8")))
        return super().do_GET()
    def do_POST(self):
        if urlparse(self.path).path != "/api/analyze":
            return self.send_error(404)
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size > 64 * 1024: raise ValueError("request too large")
            payload = json.loads(self.rfile.read(size) or b"{}")
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
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
