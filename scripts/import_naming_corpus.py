"""Rebuild the local naming reference database from checked-in uploaded sources."""
import json
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
import naming_corpus
if __name__ == '__main__':
    print(json.dumps(naming_corpus.build_database(), ensure_ascii=False, indent=2))
