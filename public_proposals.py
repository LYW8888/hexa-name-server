"""Public names and bounded explanations; full report calculations stay private."""
import name_explanations

INPUT_FIELDS = frozenset({
    'surname', 'mode', 'purpose', 'gender', 'zone', 'dueDate', 'dueTime', 'birthDate', 'birthTime',
    'algorithm', 'requiredChars', 'tabooChars', 'tabooHomophones', 'surnameReading', 'numerologyMode',
    'length', 'candidateCount', 'place', 'parents', 'currentName', 'meaning', 'likedChars', 'avoidedChars',
    'styles', 'variant', 'elementPreference', 'honorParents', 'timeBasis', 'longitude', 'locationId',
})


def review_preview(value):
    """Only everyday name facts, with no chart, numerology or private findings."""
    if not isinstance(value, dict) or not isinstance(value.get('findings'), list):
        return None
    findings = [
        {key: row[key] for key in ('id', 'title', 'detail')}
        for row in value.get('findings', [])
        if isinstance(row, dict) and row.get('id') in ('structure', 'reading', 'distinction')
        and all(isinstance(row.get(key), str) for key in ('id', 'title', 'detail'))
    ]
    if len(findings) != 3 or {row['id'] for row in findings} != {'structure', 'reading', 'distinction'}:
        return None
    if not isinstance(value.get('full_name'), str):
        return None
    return {'version': 'existing-name-preview-v1', 'full_name': value['full_name'], 'findings': findings}


def project(result):
    analysis = result['analysis']
    public = {key: analysis[key] for key in (
        'algorithm', 'purpose_code', 'mode', 'scenario', 'phase', 'current_name',
        'candidate_count', 'available_candidate_count', 'page_size', 'requested_candidate_count',
    ) if key in analysis}
    public['access'] = 'proposal_only'
    public['report_delivery'] = 'public_beta'
    public['details_version'] = name_explanations.VERSION
    if analysis.get('phase') == 'name_review':
        public['review_completed'] = True
        preview = review_preview(analysis.get('name_review') or analysis.get('review_preview'))
        if preview:
            public['review_preview'] = preview
    candidates = []
    for row in result['candidates']:
        item = {key: row[key] for key in ('name', 'given', 'pinyin', 'meaning')}
        item['pinyin'] = row.get('pronunciation', {}).get('evaluation', {}).get('full_pinyin') or row['pinyin']
        detail = name_explanations.project(row.get('details'))
        if detail:
            item['details'] = detail
        candidates.append(item)
    return {'analysis': public, 'candidates': candidates}
