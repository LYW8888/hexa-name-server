"""Explicit public projection: report calculations never cross this boundary."""

INPUT_FIELDS = frozenset({
    'surname', 'mode', 'purpose', 'gender', 'zone', 'dueDate', 'dueTime', 'birthDate', 'birthTime',
    'algorithm', 'requiredChars', 'tabooChars', 'tabooHomophones', 'surnameReading', 'numerologyMode',
    'length', 'candidateCount', 'place', 'parents', 'currentName', 'meaning', 'likedChars', 'avoidedChars',
    'styles', 'variant', 'elementPreference', 'honorParents', 'timeBasis', 'longitude', 'locationId',
})


def project(result):
    analysis = result['analysis']
    public = {key: analysis[key] for key in (
        'algorithm', 'purpose_code', 'mode', 'scenario', 'phase', 'current_name',
        'candidate_count', 'available_candidate_count', 'page_size', 'requested_candidate_count',
    ) if key in analysis}
    public['access'] = 'proposal_only'
    public['report_delivery'] = 'operator'
    if analysis.get('phase') == 'name_review':
        public['review_completed'] = True
    candidates = []
    for row in result['candidates']:
        item = {key: row[key] for key in ('name', 'given', 'pinyin', 'meaning')}
        item['pinyin'] = row.get('pronunciation', {}).get('evaluation', {}).get('full_pinyin') or row['pinyin']
        candidates.append(item)
    return {'analysis': public, 'candidates': candidates}
