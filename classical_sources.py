"""Traceable checks of short classical passages, separate from model calibration."""

from functools import lru_cache
from hashlib import sha256
import json
from pathlib import Path
import re

PATH = Path(__file__).resolve().parent / "data" / "classical-evidence.json"


def normalize(text):
    return re.sub(r"\s+|¶", "", re.sub(r"<pb:[^>]+>", "", text))


def validate(value):
    ids = set()
    for entry in value.get("entries", []):
        key = entry.get("id")
        if not key or key in ids:
            raise ValueError("classical evidence IDs must be unique")
        ids.add(key)
        if entry.get("status") != "text_checked":
            raise ValueError("unsupported classical evidence status")
        if not re.fullmatch(
            r"kanripo/[A-Za-z0-9_-]+", entry.get("repository", "")
        ) or not re.fullmatch(r"[a-f0-9]{40}", entry.get("commit", "")):
            raise ValueError("classical evidence requires a pinned repository commit")
        if not re.fullmatch(r"KR[0-9A-Za-z_]+\.txt", entry.get("file", "")):
            raise ValueError("invalid classical evidence file")
        if (
            not isinstance(entry.get("line_start"), int)
            or not isinstance(entry.get("line_end"), int)
            or not 0 < entry["line_start"] <= entry["line_end"]
        ):
            raise ValueError("invalid classical evidence line range")
        expected = f"https://github.com/{entry['repository']}/blob/{entry['commit']}/{entry['file']}#L{entry['line_start']}"
        if entry.get("url") != expected:
            raise ValueError("classical evidence URL must match its pinned location")
        snapshot = entry.get("snapshot", "")
        if not snapshot or sha256(snapshot.encode()).hexdigest() != entry.get("snapshot_sha256"):
            raise ValueError("classical evidence snapshot hash mismatch")
        quote = entry.get("quote", "")
        if not quote or quote not in normalize(snapshot):
            raise ValueError("classical quotation is absent from source snapshot")
        if not all(
            entry.get(k)
            for k in (
                "title",
                "edition",
                "chapter",
                "scope",
                "supports",
                "checked_by",
                "checked_at",
                "file_sha256",
            )
        ):
            raise ValueError("classical evidence provenance is incomplete")
    if not ids:
        raise ValueError("classical evidence cannot be empty")
    required = {
        "polarity",
        "generation",
        "control",
        "day_master_roles",
        "season_states",
        "fuyi_principle",
        "month_priority",
        "ten_god_examples",
        "yin_yang_principle",
        "bagua_images",
        "bagua_nature",
    }
    covered = {claim for entry in value["entries"] for claim in entry["supports"]}
    if not required <= covered:
        raise ValueError("classical evidence does not cover the published rule claims")
    if value.get("model_parameters", {}).get("status") != "project_defined":
        raise ValueError("model parameters must remain distinct from checked texts")
    return value


@lru_cache(maxsize=1)
def registry():
    return validate(json.loads(PATH.read_text(encoding="utf-8")))


def public_index():
    data = registry()
    fields = (
        "id",
        "title",
        "author",
        "chapter",
        "edition",
        "url",
        "quote",
        "scope",
        "status",
        "supports",
        "checked_at",
    )
    return {
        "framework_status": "text_checked",
        "parameter_status": "project_defined",
        "label": "经典原文与计算方法",
        "checked_passages": len(data["entries"]),
        "review_scope": data["review_scope"],
        "sources": [{k: entry[k] for k in fields} for entry in data["entries"]],
        "model_parameters": data["model_parameters"],
    }
