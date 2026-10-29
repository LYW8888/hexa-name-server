"""Known cases cross-checked against sxtwl 2.0.7 using the documented rules."""
import unittest
from bazi import calculate

class FourPillarsTest(unittest.TestCase):
    def pillars(self, date, time):
        return ' '.join(p['ganzhi'] for p in calculate(date, time, 'Asia/Shanghai')['pillars'])

    def test_known_dates(self):
        self.assertEqual(self.pillars('2000-01-01', '12:00'), '己卯 丙子 戊午 戊午')
        self.assertEqual(self.pillars('2024-02-10', '12:00'), '甲辰 丙寅 甲辰 庚午')

    def test_lichun_year_and_month_change_at_term(self):
        self.assertEqual(self.pillars('2024-02-04', '16:24'), '癸卯 乙丑 戊戌 庚申')
        self.assertEqual(self.pillars('2024-02-04', '16:30'), '甲辰 丙寅 戊戌 庚申')
        boundary = calculate('2024-02-04', '16:27', 'Asia/Shanghai')['boundary']
        self.assertEqual(boundary['term'], '立春')
        self.assertEqual(boundary['alternatives'], [{'year':'癸卯','month':'乙丑'},{'year':'甲辰','month':'丙寅'}])

    def test_jingzhe_changes_month(self):
        self.assertEqual(self.pillars('2024-03-05', '10:19'), '甲辰 丙寅 戊辰 丁巳')
        self.assertEqual(self.pillars('2024-03-05', '10:25'), '甲辰 丁卯 戊辰 丁巳')

    def test_late_zi_starts_next_day(self):
        self.assertEqual(self.pillars('2024-02-10', '22:59'), '甲辰 丙寅 甲辰 乙亥')
        self.assertEqual(self.pillars('2024-02-10', '23:00'), '甲辰 丙寅 乙巳 丙子')
        self.assertEqual(self.pillars('2024-02-11', '00:00'), '甲辰 丙寅 乙巳 丙子')

    def test_count_is_surface_only_and_reference_is_labeled(self):
        chart = calculate('2024-02-10', '12:00', 'Asia/Shanghai', reference=True)
        self.assertEqual(chart['element_counts'], {'木':3, '火':2, '土':2, '金':1, '水':0})
        self.assertTrue(chart['reference'])
        self.assertIn('不等同旺衰或喜用神', chart['conventions'][-1])

    def test_unsupported_and_ambiguous_dates_rejected(self):
        with self.assertRaisesRegex(ValueError, '1900'):
            calculate('1899-12-31', '12:00', 'Asia/Shanghai')
        with self.assertRaisesRegex(ValueError, '夏令时'):
            calculate('1991-04-14', '02:30', 'Asia/Shanghai')
        with self.assertRaisesRegex(ValueError, '夏令时'):
            calculate('1991-09-15', '01:30', 'Asia/Shanghai')

if __name__ == '__main__':
    unittest.main()
