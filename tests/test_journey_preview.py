"""The free current-name preview never exposes a birth chart or private report."""
from copy import deepcopy
import unittest
import public_proposals
import server

BASE = {'algorithm':'literary_v3','purpose':'rename','mode':'born','surname':'欧阳',
        'currentName':'欧阳明明','birthDate':'1998-08-13','birthTime':'13:48'}


class JourneyPreviewTest(unittest.TestCase):
    def test_actual_review_provides_only_three_everyday_findings_and_is_idempotent(self):
        full = server.review_name(BASE)
        public = public_proposals.project(full)
        self.assertEqual(public_proposals.project(public), public)
        preview = public['analysis']['review_preview']
        self.assertEqual(set(preview), {'version','full_name','findings'})
        self.assertEqual(preview['full_name'], BASE['currentName'])
        self.assertEqual([row['id'] for row in preview['findings']], ['structure','reading','distinction'])
        self.assertIn('名内重复：明', preview['findings'][2]['detail'])
        original = {row['id']:row for row in full['analysis']['name_review']['findings']}
        for row in preview['findings']:
            self.assertEqual(row, original[row['id']])
        self.assertNotIn('name_review',public['analysis'])
        self.assertEqual(public['candidates'], [])

    def test_nested_private_fields_are_dropped_and_recommendations_have_no_preview(self):
        full = server.review_name(BASE)
        review = full['analysis']['name_review']
        review['bazi'] = {'secret':'private-chart'}
        for row in review['findings']:
            row['raw_report'] = 'private-chart'
        preview = public_proposals.project(full)['analysis']['review_preview']
        self.assertNotIn('private-chart', str(preview))
        self.assertFalse(any(row['id'] in ('birth','glyph') for row in preview['findings']))
        proposed = deepcopy(full)
        proposed['analysis']['phase'] = 'recommendations'
        self.assertNotIn('review_preview',public_proposals.project(proposed)['analysis'])

    def test_missing_or_malformed_findings_do_not_create_an_invented_preview(self):
        for value in (None, {}, {'full_name':'欧阳明明','findings':[]},
                      {'full_name':'欧阳明明','findings':None},
                      {'full_name':'欧阳明明','findings':'invalid'},
                      {'full_name':'欧阳明明','findings':[{'id':'structure','title':'结构'}]}):
            self.assertIsNone(public_proposals.review_preview(value))
