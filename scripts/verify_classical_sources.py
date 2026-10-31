"""Audit checked-in quotations, optionally against exact upstream Git commits.

The audit checks text/location and implementation tables, not a destiny claim or
professional calibration of the project's numerical weights.
"""

import argparse
import json
from pathlib import Path
from hashlib import sha256
import subprocess
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import classical_sources
import tradition

parser = argparse.ArgumentParser()
parser.add_argument("--checkout-root", help="Folder containing sanming and zhouyi source checkouts")
parser.add_argument(
    "--fetch",
    action="store_true",
    help="Fetch pinned public source commits into temporary repositories",
)
parser.add_argument("--output")
args = parser.parse_args()
value = classical_sources.registry()
rows = []
with tempfile.TemporaryDirectory(prefix="hexa-source-audit-") as temporary:
    fetched = {}
    for entry in value["entries"]:
        raw = None
        if args.fetch:
            identity = (entry["repository"], entry["commit"])
            if identity not in fetched:
                folder = Path(temporary) / entry["repository"].split("/")[-1]
                subprocess.run(["git", "init", "--quiet", str(folder)], check=True)
                subprocess.run(
                    [
                        "git",
                        "-C",
                        str(folder),
                        "fetch",
                        "--quiet",
                        "--depth",
                        "1",
                        "https://github.com/" + entry["repository"] + ".git",
                        entry["commit"],
                    ],
                    check=True,
                )
                fetched[identity] = folder
            raw = subprocess.check_output(
                ["git", "-C", str(fetched[identity]), "show", entry["commit"] + ":" + entry["file"]]
            )
        elif args.checkout_root:
            folder = Path(args.checkout_root) / (
                "sanming" if entry["repository"].endswith("KR3g0042") else "zhouyi"
            )
            head = subprocess.check_output(
                ["git", "-C", str(folder), "rev-parse", "HEAD"], text=True
            ).strip()
            if head != entry["commit"]:
                raise ValueError("source checkout is not at the recorded commit")
            raw = (folder / entry["file"]).read_bytes()
        if raw is not None:
            if sha256(raw).hexdigest() != entry["file_sha256"]:
                raise ValueError("upstream file hash mismatch: " + entry["id"])
            fragment = "".join(
                raw.decode().splitlines(keepends=True)[entry["line_start"] - 1 : entry["line_end"]]
            )
            if fragment != entry["snapshot"]:
                raise ValueError("upstream lines differ: " + entry["id"])
        rows.append(
            {
                "id": entry["id"],
                "status": "passed",
                "commit": entry["commit"],
                "upstream_compared": raw is not None,
            }
        )
# Concrete full-cycle and polarity checks against the retained ancient passages.
by_id = {x["id"]: x for x in value["entries"]}
generation = classical_sources.normalize(by_id["sm-generation"]["snapshot"])
control = classical_sources.normalize(by_id["sm-control"]["snapshot"]).replace("尅", "克")
for element, target in tradition.GENERATES.items():
    if element + "生" + target not in generation:
        raise ValueError("generation cycle not supported by retained passage")
for element, target in tradition.CONTROLS.items():
    if element + "克" + target not in control:
        raise ValueError("control cycle not supported by retained passage")
polarity = classical_sources.normalize(by_id["sm-polarity"]["snapshot"])
for chars in ("甲丙戊庚壬", "乙丁己辛癸", "子寅辰午申戌", "丑卯巳未酉亥"):
    if chars not in polarity:
        raise ValueError("polarity sequence absent")
report = {
    "checked_passages": len(rows),
    "failed": 0,
    "upstream_compared": bool(args.fetch or args.checkout_root),
    "rule_checks": ["五行相生5项", "五行相克5项", "干支阴阳4组"],
    "scope": value["review_scope"],
    "parameter_status": "project_defined",
    "text_issues": value["text_issues"],
    "entries": rows,
}
if args.output:
    Path(args.output).write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
print(
    json.dumps(
        {k: v for k, v in report.items() if k not in ("entries", "text_issues")},
        ensure_ascii=False,
        indent=2,
    )
)
