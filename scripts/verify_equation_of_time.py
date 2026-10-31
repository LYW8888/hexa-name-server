"""Offline EOT cross-check using the separately installed JPL DE421 kernel.

Use UT1 for Greenwich mean solar hours; directly subtracting UTC introduces
historical DUT1 offsets unrelated to the equation-of-time approximation.
"""

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
import sys
import skyfield_data
from skyfield.api import load, load_file

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from solar_time import equation_of_time

parser = argparse.ArgumentParser()
parser.add_argument("--output")
args = parser.parse_args()
ephemeris = load_file(str(Path(skyfield_data.__file__).parent / "data" / "de421.bsp"))
timescale = load.timescale()
rows = []
for year in sorted(set(range(1900, 2051, 10)) | {2024}):
    for month in range(1, 13):
        instant = datetime(year, month, 15, 12, tzinfo=timezone.utc)
        t = timescale.from_datetime(instant)
        ra, _, _ = ephemeris["earth"].at(t).observe(ephemeris["sun"]).apparent().radec(epoch="date")
        mean_hours = ((t.ut1 + 0.5) % 1) * 24
        reference = float(((t.gast - ra.hours + 12 - mean_hours + 12) % 24 - 12) * 60)
        estimate = equation_of_time(instant)
        rows.append(
            {
                "utc": instant.isoformat(),
                "estimate_minutes": round(estimate, 8),
                "jpl_minutes": round(reference, 8),
                "error_seconds": round((estimate - reference) * 60, 6),
            }
        )
maximum = max(abs(x["error_seconds"]) for x in rows)
report = {
    "method": "NOAA/Meeus EOT versus GAST minus JPL DE421 apparent geocentric solar RA of date, using UT1 mean solar clock",
    "samples": len(rows),
    "years": "1900–2050 every ten years, plus 2024; noon UTC on the 15th of each month",
    "max_absolute_error_seconds": maximum,
    "bound_seconds": 15,
    "passed": maximum < 15,
    "limitations": "Sampling only; no 2051–2100 ephemeris check, no official certification. Not a verification of Mingli pattern/strength/favourable-element rules.",
    "rows": rows,
}
if args.output:
    Path(args.output).write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({k: v for k, v in report.items() if k != "rows"}, ensure_ascii=False, indent=2))
if not report["passed"]:
    raise SystemExit(1)
