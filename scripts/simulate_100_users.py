import argparse
import concurrent.futures
import json
import random
import urllib.error
import urllib.request
from collections import Counter, defaultdict

random.seed(20261029)
parser = argparse.ArgumentParser(description='Run 100 deterministic synthetic user journeys against local 序名 API.')
parser.add_argument('--base-url', default='http://127.0.0.1:4173')
parser.add_argument('--output', default='-')
args = parser.parse_args()
BASE_URL = args.base_url.rstrip('/')
places = [
    ('杭州', 'Asia/Shanghai'), ('北京', 'Asia/Shanghai'), ('上海', 'Asia/Shanghai'),
    ('台北', 'Asia/Taipei'), ('香港', 'Asia/Hong_Kong'), ('成都', 'Asia/Shanghai'),
    ('深圳', 'Asia/Shanghai'), ('新加坡', 'Asia/Shanghai'),
]
surnames = ['林', '李', '王', '陈', '周', '沈', '赵', '欧阳']
genders = ['unknown', 'male', 'female']
styles = [['classical'], ['modern'], ['nature'], ['bright'], ['classical', 'nature'], []]

users = []
for i in range(100):
    place, zone = places[i % len(places)]
    surname = surnames[i % len(surnames)]
    gender = genders[i % len(genders)]
    length = [1, 2, 3][i % 3]
    requested = [1, 2, 3, 5, 7, 11][i % 6]
    base = {
        'purpose': 'newborn', 'mode': 'due_date', 'surname': surname,
        'dueDate': f'{2027 + (i % 3)}-{(i % 9) + 1:02d}-{(i % 20) + 1:02d}',
        'dueTime': f'{8 + (i % 10):02d}:{(i * 7) % 60:02d}',
        'place': place, 'zone': zone, 'length': length,
        'candidateCount': requested, 'gender': gender,
        'parents': '沈、周' if i % 4 == 0 else '',
        'meaning': ['清朗安定', '自然开阔', '知行合一', '温柔坚定'][i % 4],
        'chars': ['喜欢安', '避开伟', '喜欢清，避开刚', ''][i % 4],
        'styles': styles[i % len(styles)],
    }
    if 25 <= i < 50:
        base.update({'mode': 'born', 'dueDate': '', 'birthDate': f'2024-{(i % 9) + 1:02d}-15', 'birthTime': f'{(i * 3) % 24:02d}:{(i * 11) % 60:02d}'})
    elif 50 <= i < 70:
        base.update({'purpose': 'newborn', 'mode': 'born', 'dueDate': '', 'birthDate': f'2026-{(i % 9) + 1:02d}-15', 'birthTime': f'{(i * 3) % 24:02d}:{(i * 11) % 60:02d}'})
    elif 70 <= i < 90:
        base.update({'purpose': 'rename', 'mode': 'born', 'currentName': f'{surname}知远', 'birthDate': f'2020-{(i % 9) + 1:02d}-15', 'birthTime': f'{(i * 3) % 24:02d}:{(i * 11) % 60:02d}', 'dueDate': ''})
    elif i >= 90:
        # Intentional malformed sessions: partial actual time, bad candidate count, invalid zone.
        if i == 90:
            base.update({'birthDate': '2026-02-01', 'birthTime': '', 'mode': 'due_date'})
        elif i == 91:
            base.update({'candidateCount': 12})
        elif i == 92:
            base.update({'zone': 'UTC'})
        elif i == 93:
            base.update({'purpose': 'rename', 'mode': 'due_date', 'dueDate': '2027-01-01'})
        elif i == 94:
            base.update({'place': ''})
        elif i == 95:
            base.update({'birthDate': '2999-01-01', 'birthTime': '08:00', 'mode': 'born'})
        elif i == 96:
            base.update({'dueDate': '', 'mode': 'due_date'})
        elif i == 97:
            base.update({'surname': ''})
        elif i == 98:
            base.update({'length': 4})
        elif i == 99:
            base.update({'gender': 'other'})
    users.append(base)

def call(item):
    req = urllib.request.Request(
        BASE_URL + '/api/analyze',
        data=json.dumps(item, ensure_ascii=False).encode(),
        headers={'Content-Type': 'application/json'},
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            return {'ok': True, 'status': response.status, 'body': json.load(response), 'input': item}
    except urllib.error.HTTPError as error:
        return {'ok': False, 'status': error.code, 'body': json.load(error), 'input': item}
    except Exception as error:
        return {'ok': False, 'status': None, 'body': {'error': str(error)}, 'input': item}

with concurrent.futures.ThreadPoolExecutor(max_workers=12) as executor:
    results = list(executor.map(call, users))

valid = [r for r in results if r['ok']]
invalid = [r for r in results if not r['ok']]
scenarios = Counter(r['body']['analysis']['scenario'] for r in valid)
purposes = Counter(r['body']['analysis']['purpose'] for r in valid)
counts = Counter(r['body']['analysis']['candidate_count'] for r in valid)
errors = Counter(r['body'].get('error', 'unknown') for r in invalid)
lengths = Counter(len(r['body']['candidates']) for r in valid)
report = {
    'total': len(results), 'success': len(valid), 'errors': len(invalid),
    'success_rate': round(len(valid) / len(results) * 100, 1),
    'scenarios': dict(scenarios), 'purposes': dict(purposes),
    'actual_candidate_counts': dict(counts), 'returned_candidate_lengths': dict(lengths),
    'errors': dict(errors),
    'first_successes': [
        {'purpose': r['body']['analysis']['purpose'], 'scenario': r['body']['analysis']['scenario'], 'candidates': [x['name'] for x in r['body']['candidates'][:3]]}
        for r in valid[:5]
    ],
}
payload = json.dumps(report, ensure_ascii=False, indent=2)
if args.output == '-':
    print(payload)
else:
    with open(args.output, 'w', encoding='utf-8') as handle:
        handle.write(payload + '\n')
    print(f'Wrote {args.output}')
