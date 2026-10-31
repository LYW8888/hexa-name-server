"""Local, advisory Mandarin-reading checks; never a complete homophone screen."""
from functools import lru_cache
from unicodedata import normalize

from pypinyin import Style, pinyin


def is_han(char: str) -> bool:
    if len(char) != 1:
        return False
    code = ord(char)
    return (code == 0x3007 or 0x3400 <= code <= 0x9fff or
            0xf900 <= code <= 0xfaff or 0x20000 <= code <= 0x323af)


@lru_cache(maxsize=4096)
def _readings(char: str) -> tuple[str, ...]:
    # Ask for each character separately: a name's contextual reading must not
    # be silently inferred from general vocabulary phrases.
    values = pinyin(char, style=Style.TONE, heteronym=True, errors=lambda value: list(value))
    if not values:
        return ()
    return tuple(dict.fromkeys(normalize('NFC', value.lower()) for value in values[0] if value != char))


def default_reading(given: str) -> str:
    """Dictionary first readings for explanation, never a personal-reading claim."""
    return " ".join((_readings(char) or (char,))[0] for char in given)


def check(surname: str, given: str, recorded_pinyin: str) -> dict:
    tokens = [normalize('NFC', value.lower()) for value in recorded_pinyin.split()]
    surname_results = [{'character': char, 'readings': list(_readings(char))} for char in surname]
    given_results = []
    for index, char in enumerate(given):
        readings = _readings(char)
        selected = tokens[index] if index < len(tokens) else ''
        given_results.append({'character': char, 'selected': selected, 'readings': list(readings),
                              'status': 'unknown' if not readings else 'listed' if selected in readings else 'unmatched'})
    # Unexpected extra syllables are also a mismatch; no verified claim is made.
    if len(tokens) != len(given_results):
        for result in given_results:
            if result['status'] != 'unknown':
                result['status'] = 'unmatched'
    repeated = list(dict.fromkeys(char for char in surname if char in given))
    return {
        'surname': surname_results, 'given': given_results, 'surname_given_overlap': repeated,
        'source': {'library': 'pypinyin', 'version': '0.55.0', 'license': 'MIT'},
        'limitations': '仅对照字典中的普通话单字读音，不代表姓氏专用读音或完整人名读音核验；不检查方言和谐音。',
    }
