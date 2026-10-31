"""Selected Mandarin readings, bounded syllable matching, and declared tone rules."""
from functools import lru_cache
from pypinyin import pinyin, Style
from pypinyin.contrib.tone_convert import to_tone, to_tone3, to_normal
import naming_corpus
import phonetics


def tokens(reading):
    return tuple(to_normal(token.lower()) for token in reading.split())


def surname_reading(surname, selected=''):
    value = naming_corpus.snapshot()
    choices = [phonetics._readings(c) for c in surname]
    default = value['surname_readings'].get(surname)
    chosen = ' '.join(to_tone(t) for t in (selected or default or phonetics.default_reading(surname)).split())
    parts = chosen.split()
    dictionary_ok = len(parts)==len(surname) and all(t in choices[i] for i,t in enumerate(parts))
    declared_default = default and chosen == ' '.join(to_tone(t) for t in default.split())
    if not dictionary_ok and not declared_default:
        raise ValueError('surnameReading must match a recorded surname reading')
    return chosen


@lru_cache(maxsize=1)
def negative_terms():
    overrides = {'秦桧':'qín huì','和珅':'hé shēn'}
    return [(term,tokens(overrides.get(term) or phonetics.default_reading(term)))
            for term in naming_corpus.snapshot()['rules']['negative_homophones']]


def sequence_matches(sequence, subsequence):
    return bool(subsequence) and any(sequence[i:i+len(subsequence)] == subsequence for i in range(len(sequence)-len(subsequence)+1))


def negatives(full_reading):
    sequence = tokens(full_reading)
    return [term for term, sound in negative_terms() if sequence_matches(sequence,sound)]


def assess(surname, given, given_reading, selected_surname=''):
    reading = surname_reading(surname, selected_surname)
    value = phonetics.check(surname,given,given_reading)
    for char, selected in zip(value['surname'],reading.split()):
        char['selected'] = selected
    full = reading+' '+given_reading
    tones = [int(t[-1]) if t[-1:].isdigit() else 5 for t in (to_tone3(p,neutral_tone_with_five=True) for p in full.split())]
    given_tones = tones[len(surname):]
    base = 4 if len(given_tones)==1 else sum(naming_corpus.snapshot()['rules']['tone_pairs'].get(str(a)+str(b),3) for a,b in zip(given_tones,given_tones[1:]))/(len(given_tones)-1)
    triple = any(all(t in (1,2) for t in tones[i:i+3]) or all(t in (3,4) for t in tones[i:i+3]) for i in range(len(tones)-2))
    # Split the already-selected syllable, not the dictionary's first heteronym.
    import re
    plain = tokens(given_reading)
    initials = [(re.match(r'^(zh|ch|sh|[bpmfdtnlgkhjqxrzcs])', t).group(0) if re.match(r'^(zh|ch|sh|[bpmfdtnlgkhjqxrzcs])',t) else '') for t in plain]
    finals = [t[len(initial):] for t,initial in zip(plain,initials)]
    # Use selected syllables for similarity; no contextual word-reading inference.
    syllables = tokens(given_reading)
    identical = any(a==b for a,b in zip(syllables,syllables[1:]))
    same_initial = any(a and a==b for a,b in zip(initials,initials[1:]))
    same_final = any(a and a==b for a,b in zip(finals,finals[1:]))
    raw = base-(2 if triple else 0)+(-2 if identical else 1 if same_initial or same_final else 0)
    points = 15 if raw>=5 else 12 if raw>=4 else 9 if raw>=3 else 5
    matches = negatives(full)
    value['evaluation'] = {'full_pinyin':full,'tones':tones,'given_tones':given_tones,
        'pattern':'-'.join(map(str,tones)),'raw':round(raw,3),'normalized':points/15,
        'triple_same_category':triple,'same_initial':same_initial,'same_final':same_final,
        'negative_matches':matches,'scope':'普通话已选读音及当前多音节词表，不覆盖全部方言或谐音。'}
    return value
