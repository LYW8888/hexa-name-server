import json
import unittest
from pathlib import Path

import phonetics


class PronunciationTest(unittest.TestCase):
    def test_compound_and_polyphonic_surname_has_options_without_guessing(self):
        result = phonetics.check('单', '知衡', 'ZHĪ HÉNG')
        readings = result['surname'][0]['readings']
        self.assertIn('dān', readings)
        self.assertIn('shàn', readings)
        self.assertTrue(all(item['status'] == 'listed' for item in result['given']))
        self.assertIn('不检查方言和谐音', result['limitations'])
        compound = phonetics.check('欧阳', '安', 'ĀN')
        self.assertEqual([x['character'] for x in compound['surname']], ['欧', '阳'])

    def test_unknown_and_mismatch_are_explicit(self):
        result = phonetics.check('𲎯', '知衡', 'HĀO HÉNG')
        self.assertEqual(result['surname'][0]['readings'], [])
        self.assertEqual(result['given'][0]['status'], 'unmatched')
        self.assertEqual(result['given'][1]['status'], 'listed')
        self.assertEqual(phonetics.check('林', '𲎯', 'HĀO')['given'][0]['status'], 'unknown')
        self.assertEqual(phonetics.check('林', '安', 'ĀN HÉ')['given'][0]['status'], 'unmatched')

    def test_name_overlap_and_extended_han(self):
        self.assertEqual(phonetics.check('安', '予安', 'YǓ ĀN')['surname_given_overlap'], ['安'])
        for char in ('林', '𠮷', '〇'):
            self.assertTrue(phonetics.is_han(char))
        for char in ('A', '😀', '、'):
            self.assertFalse(phonetics.is_han(char))

    def test_catalog_recorded_readings_appear_in_dictionary(self):
        catalog = json.loads((Path(__file__).resolve().parents[1] / 'data/names.json').read_text(encoding='utf8'))
        for item in catalog['names']:
            with self.subTest(name=item['given']):
                result = phonetics.check('林', item['given'], item['pinyin'])
                self.assertTrue(all(entry['status'] == 'listed' for entry in result['given']))


if __name__ == '__main__':
    unittest.main()
