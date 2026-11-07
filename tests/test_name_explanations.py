"""Public per-name details must explain real evidence without exposing full reports."""
from copy import deepcopy
import hashlib
import unittest
import naming_corpus
import name_explanations
import public_proposals
import server

BASE = {'algorithm':'literary_v3','surname':'陈','mode':'born','birthDate':'2024-04-10','birthTime':'12:00','place':'杭州','candidateCount':10,'elementPreference':'yongshen'}


class NameExplanationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.full = server.analyze(BASE)

    def test_ten_distinct_candidates_each_have_traceable_explanations(self):
        public = public_proposals.project(self.full)
        self.assertEqual(len(public['candidates']), 10)
        self.assertEqual(len({c['name'] for c in public['candidates']}), 10)
        quoted = 0
        for row in public['candidates']:
            detail = row['details']
            self.assertTrue(detail['benefits'])
            self.assertTrue(detail['fit']['explanation'])
            for citation in detail['source']['citations']:
                quoted += 1
                source = naming_corpus.snapshot()['sources'][citation['source_id']]
                raw = (naming_corpus.DATA / 'raw' / source['filename']).read_bytes()
                self.assertEqual(hashlib.sha256(raw).hexdigest(), citation['sha256'])
                line = raw.decode('utf-8-sig').replace('\r\n','\n').splitlines()[citation['line']-1]
                self.assertIn(citation['quote'], line)
                self.assertTrue(citation['selected_characters'])
                self.assertTrue(all(c in citation['quote'] and c in row['given'] for c in citation['selected_characters']))
        self.assertGreater(quoted, 0)

    def test_no_padding_when_required_two_character_name_has_only_two_orders(self):
        result = server.analyze({**BASE,'requiredChars':'沐清','numerologyMode':'off'})
        self.assertLessEqual(len(result['candidates']), 2)
        self.assertTrue(result['candidates'])
        for row in result['candidates']:
            self.assertEqual(set(row['given']), set('沐清'))
            source = row['details']['source']
            if source['kind'] == 'cross_passage':
                self.assertIn('不一定', source['summary'])
                self.assertTrue(source['citations'])

    def test_modern_combinations_never_invent_classical_quotes(self):
        result = server.analyze({**BASE,'algorithm':'legacy_v2'})
        for row in result['candidates']:
            detail = row['details']['source']
            self.assertEqual(detail['kind'], 'modern_meaning')
            self.assertEqual(detail['citations'], [])
            self.assertIn('没有', detail['summary'])

    def test_control_direction_is_correct_and_is_not_called_bad_fortune(self):
        row = {'given':'金木','name':'陈金木','pinyin':'jīn mù','meaning':'测试解释',
               'characters':[{'char':'金','element':'金'},{'char':'木','element':'木'}]}
        detail = name_explanations.build(row, self.full['analysis'])
        self.assertEqual(detail['elements']['pairs'][0]['label'], '金克木')
        self.assertEqual(detail['elements']['pairs'][0]['kind'], 'control')
        self.assertIn('不能单凭', detail['elements']['pairs'][0]['text'])
        self.assertIn('不额外重复加扣分', detail['elements']['usage'])

    def test_civil_city_changes_do_not_invent_element_influence(self):
        left = self.full
        right = server.analyze({**BASE,'place':'喀什'})
        self.assertEqual([c['name'] for c in left['candidates']], [c['name'] for c in right['candidates']])
        self.assertFalse(right['candidates'][0]['details']['birthplace']['applied'])
        self.assertIn('不会改变', right['candidates'][0]['details']['birthplace']['explanation'])

    def test_solar_place_is_explained_only_when_applied(self):
        result = server.analyze({**BASE,'place':'喀什','locationId':'kashgar','longitude':75.99,'timeBasis':'apparent_solar'})
        place = result['candidates'][0]['details']['birthplace']
        self.assertTrue(place['applied'])
        self.assertIn('经度时差', place['explanation'])

    def test_none_and_due_date_modes_are_honest(self):
        request = {key:value for key,value in BASE.items() if key not in ('birthDate','birthTime')}
        result = server.analyze({**request,'mode':'due_date','dueDate':'2099-12-23','elementPreference':'none'})
        for row in result['candidates']:
            self.assertIn('没有参与', row['details']['fit']['explanation'])
            self.assertIn('预产期', row['details']['reference_note'])
            self.assertNotIn('element', [c['id'] for c in row['ranking']['criteria']])

    def test_projection_blocks_full_report_fields_and_is_repeatable(self):
        source = deepcopy(self.full)
        detail = source['candidates'][0]['details']
        detail['bazi'] = source['analysis']['bazi']
        detail['source']['private_report'] = {'token':'secret'}
        detail['fit']['pillars'] = source['analysis']['bazi']['pillars']
        public = public_proposals.project(source)
        self.assertEqual(public_proposals.project(public), public)
        self.assertNotIn('bazi', public['analysis'])
        cleaned = public['candidates'][0]['details']
        self.assertNotIn('bazi', cleaned)
        self.assertNotIn('private_report', cleaned['source'])
        self.assertNotIn('pillars', cleaned['fit'])


if __name__ == '__main__':
    unittest.main()
