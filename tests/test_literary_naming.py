"""Golden cases from the proposal audit and end-to-end literary naming contracts."""
import hashlib
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
from lunar_python import Solar
import bazi
import literary_engine
import name_numerology
import name_phonology
import naming_auxiliary
import naming_corpus
import server

BASE={'algorithm':'literary_v3','surname':'李','mode':'born','birthDate':'1998-08-13','birthTime':'13:48','place':'河南南阳','elementPreference':'yongshen','length':2,'candidateCount':5}

class CorpusTest(unittest.TestCase):
    def test_import_has_unique_dictionary_and_traceable_selected_quotes(self):
        value=naming_corpus.snapshot()
        self.assertEqual(len(value['characters']),3636)
        self.assertEqual(len(value['phrases']),82)
        self.assertEqual(len(value['profiles']),121)
        self.assertGreater(value['passage_count'],5000)
        for row in value['phrases']:
            source=value['sources'][row['source_id']]
            raw=(naming_corpus.DATA/'raw'/source['filename']).read_bytes()
            self.assertEqual(hashlib.sha256(raw).hexdigest(),source['sha256'])
            line=raw.decode('utf-8-sig').splitlines()[row['line']-1]
            self.assertIn(row['quote'],line)
            self.assertTrue(set(row['given'])<=set(row['quote']))
        self.assertNotIn('修省',[p['given'] for p in value['phrases']])

    def test_sqlite_rebuild_preserves_sources_and_import_is_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'reference.sqlite3'
            one=naming_corpus.build_database(path);two=naming_corpus.build_database(path)
            self.assertEqual(one,two)
            with sqlite3.connect(path) as conn:
                self.assertEqual(conn.execute('PRAGMA integrity_check').fetchone()[0],'ok')
                self.assertEqual(conn.execute('SELECT count(*) FROM characters').fetchone()[0],3636)
                self.assertEqual(conn.execute('SELECT count(*) FROM positive_characters').fetchone()[0],121)

    def test_source_hash_mismatch_never_replaces_existing_database(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'reference.sqlite3';naming_corpus.build_database(path)
            before=path.read_bytes()
            original=naming_corpus._json
            def altered(name):
                data=original(name)
                if name=='sources.json':data['sources'][0]['sha256']='0'*64
                return data
            with patch.object(naming_corpus,'_json',altered),self.assertRaisesRegex(ValueError,'hash mismatch'):
                naming_corpus.build_database(path)
            self.assertEqual(path.read_bytes(),before)

    def test_metadata_and_html_never_become_citations_or_display_markup(self):
        value=naming_corpus.snapshot()
        self.assertTrue(all(not __import__('re').search(r'<(?:hr|div|span|script)\b',r['definition'],__import__('re').I) for r in value['characters'].values()))
        self.assertTrue(all('内容由AI生成' not in r['quote'] for r in value['phrases']))
        self.assertEqual(naming_corpus.clean_text('清<hr>朗 &amp; 正'),'清 朗 & 正')

    def test_missing_common_character_is_not_labelled_rare_or_given_guessed_strokes(self):
        self.assertNotIn('清',naming_corpus.snapshot()['characters'])
        fact=literary_engine.character('清')
        self.assertIsNone(fact['kangxi_strokes'])
        self.assertEqual(fact['stroke_status'],'unresolved')
        self.assertIn('清',naming_corpus.snapshot()['profiles'])

class NumerologyTest(unittest.TestCase):
    def test_compound_surname_counterexample_from_proposal(self):
        value=name_numerology.calculate('欧阳','明哲')
        self.assertEqual(value['strokes']['surname'],[15,12])
        self.assertEqual({k:v['raw'] for k,v in value['grids'].items()},{'天格':27,'人格':20,'地格':18,'总格':45,'外格':25})
        self.assertFalse(value['strict_pass'])

    def test_single_surname_single_name_and_three_character_extension(self):
        single=name_numerology.calculate('李','明')
        self.assertEqual(single['grids']['外格']['raw'],2)
        self.assertEqual(single['grids']['地格']['raw'],9)
        compound=name_numerology.calculate('欧阳','明')
        self.assertEqual(compound['grids']['外格']['raw'],16)
        three=name_numerology.calculate('李','明哲安')
        self.assertEqual(three['grids']['地格']['raw'],24)
        self.assertEqual(three['grids']['外格']['raw'],17)

    def test_unknown_and_ambiguous_forms_are_not_guessed(self):
        for given in ('清','云','后'):
            value=name_numerology.calculate('李',given)
            self.assertEqual(value['status'],'incomplete')
            self.assertNotIn('strict_pass',value)
        self.assertEqual(name_numerology.calculate('𠮷','明')['status'],'incomplete')

    def test_grid_tables_cover_every_number_without_conflicts(self):
        rules=naming_corpus.snapshot()['rules']['numerology']
        groups=[set(rules[k]) for k in ('good','mixed','bad')]
        self.assertEqual(set.union(*groups),set(range(1,82)))
        self.assertFalse(groups[0]&groups[1] or groups[0]&groups[2] or groups[1]&groups[2])
        self.assertEqual((81-1)%rules['period']+1,1)
        self.assertEqual((82-1)%rules['period']+1,2)

class SoundTest(unittest.TestCase):
    def test_xiaoxiang_uses_actual_first_tones(self):
        value=name_phonology.assess('李','潇湘','xiāo xiāng')['evaluation']
        self.assertEqual(value['given_tones'],[1,1])
        self.assertEqual(value['raw'],4)

    def test_syllable_boundaries_and_curated_negative_names(self):
        self.assertIn('屎真香',name_phonology.negatives('shǐ zhēn xiāng'))
        self.assertNotIn('王八',name_phonology.negatives('wáng bān'))
        self.assertIn('秦桧',name_phonology.negatives('qín huì'))
        self.assertFalse(name_phonology.sequence_matches(('wang','ban'),('wang','ba')))

    def test_polyphonic_surname_can_be_selected_and_is_validated(self):
        self.assertEqual(name_phonology.surname_reading('单'),'shàn')
        self.assertEqual(name_phonology.surname_reading('单','dān'),'dān')
        self.assertEqual(name_phonology.surname_reading('欧阳'),'ōu yáng')
        with self.assertRaisesRegex(ValueError,'surnameReading'):
            name_phonology.surname_reading('李','wang2')

class LiteraryApiTest(unittest.TestCase):
    def test_frontend_profile_grows_past_fixed_catalog_and_has_six_dimensions(self):
        result=server.analyze({**BASE,'elementPreference':'水'})
        self.assertEqual(result['analysis']['algorithm'],'literary_v3')
        self.assertGreater(result['analysis']['available_candidate_count'],65)
        self.assertEqual(len(result['candidates']),5)
        for item in result['candidates']:
            self.assertEqual(len(item['given']),2)
            self.assertEqual(item['name'],'李'+item['given'])
            self.assertLessEqual(item['score'],100)
            self.assertGreaterEqual(item['score'],0)
            self.assertIn('典故出处',[c['label'] for c in item['ranking']['criteria']])
            for citation in item['citations']:
                self.assertEqual(citation['status'],'text_matched')
                self.assertEqual(len(citation['sha256']),64)
            points=sum(c['points'] for c in item['ranking']['criteria'])
            possible=sum(c['possible'] for c in item['ranking']['criteria'])
            self.assertEqual(item['ranking']['raw_points'],round(points,2))
            self.assertEqual(item['score'],int(points/possible*100+.5))

    def test_names_are_deterministic_across_repeats_and_groups_are_duplicate_free(self):
        first=server.analyze(BASE);again=server.analyze(BASE)
        self.assertEqual(first,again)
        second=server.analyze({**BASE,'variant':1})
        self.assertTrue({x['name'] for x in first['candidates']}.isdisjoint(x['name'] for x in second['candidates']))

    def test_required_generation_character_never_lost_to_diversity_or_count(self):
        value=server.analyze({**BASE,'requiredChars':'安','candidateCount':11})
        self.assertEqual(len(value['candidates']),11)
        self.assertTrue(all('安' in x['given'] for x in value['candidates']))
        self.assertEqual(len({x['name'] for x in value['candidates']}),11)

    def test_constraints_conflict_and_length_are_rejected(self):
        for extra in ({'requiredChars':'安','avoidedChars':'安'},{'requiredChars':'安','tabooChars':'安'},{'requiredChars':'安宁明'},{'requiredChars':'abc'},{'numerologyMode':'bad'},{'tabooChars':'a'}):
            with self.subTest(extra=extra),self.assertRaises(ValueError):
                server.analyze({**BASE,**extra})

    def test_family_taboo_is_explicit_and_does_not_filter_surname(self):
        value=server.analyze({**BASE,'tabooChars':'李、安','honorParents':True,'parents':'安'})
        self.assertTrue(value['candidates'])
        self.assertTrue(all(x['name'].startswith('李') and not(set(x['given'])&set('李安')) for x in value['candidates']))

    def test_taboo_homophones_and_negative_names_are_hard_constraints(self):
        value=server.analyze({**BASE,'tabooChars':'岸','tabooHomophones':True})
        for item in value['candidates']:
            self.assertNotIn('an',name_phonology.tokens(item['pinyin']))
            self.assertFalse(name_phonology.negatives(item['pronunciation']['evaluation']['full_pinyin']))

    def test_uncovered_required_characters_return_explanation_not_substitution(self):
        value=server.analyze({**BASE,'requiredChars':'龘'})
        self.assertEqual(value['candidates'],[])
        self.assertEqual(value['analysis']['available_candidate_count'],0)
        self.assertIn('龘',value['analysis']['empty_reason'])

    def test_strict_numerology_and_off_mode(self):
        strict=server.analyze({**BASE,'numerologyMode':'strict','candidateCount':11})
        self.assertTrue(strict['candidates'])
        self.assertTrue(all(x['numerology']['strict_pass'] for x in strict['candidates']))
        off=server.analyze({**BASE,'numerologyMode':'off'})
        self.assertTrue(all(x['numerology']['status']=='off' for x in off['candidates']))

    def test_single_and_three_character_given_names_keep_custom_quantity(self):
        for length in (1,3):
            result=server.analyze({**BASE,'surname':'欧阳','length':length,'candidateCount':11,'requiredChars':'安'})
            self.assertEqual(len(result['candidates']),11 if length==3 else 1)
            self.assertTrue(all(len(x['given'])==length and '安' in x['given'] for x in result['candidates'])) if length==3 else self.assertEqual(len(result['candidates']),1)

    def test_single_required_character_has_only_one_result_and_stops(self):
        value=server.analyze({**BASE,'length':1,'requiredChars':'安','candidateCount':11})
        self.assertEqual([x['given'] for x in value['candidates']],['安'])
        self.assertFalse(value['analysis']['has_more_candidates'])
        self.assertEqual(value['analysis']['page_size'],11)

    def test_last_page_size_does_not_shift_page_offsets(self):
        value=server.analyze({**BASE,'candidateCount':11,'requiredChars':'安'})
        total=value['analysis']['available_candidate_count']
        variant=(total-1)//11
        last=server.analyze({**BASE,'candidateCount':11,'requiredChars':'安','variant':variant})
        self.assertEqual(last['analysis']['page_size'],11)
        self.assertEqual(len(last['candidates']),total-variant*11)
        self.assertFalse(last['analysis']['has_more_candidates'])
        beyond=server.analyze({**BASE,'candidateCount':11,'requiredChars':'安','variant':variant+1})
        self.assertEqual(beyond['candidates'],[])

    def test_same_sentence_evidence_does_not_require_artificial_dual_sources(self):
        item=literary_engine.phrases()['明哲']
        self.assertEqual(item['source_kind'],'same_sentence')
        self.assertEqual(len(item['citations']),1)
        self.assertIn('既明且哲',item['citations'][0]['quote'])

    def test_gender_weights_unknown_and_neutral_reference_normalize_to_100(self):
        for gender in ('unknown','male','female'):
            value=server.analyze({**BASE,'gender':gender,'elementPreference':'none'})
            for item in value['candidates']:
                self.assertEqual(sum(item['ranking']['weights'].values()),100)
                self.assertNotIn('element',[c['id'] for c in item['ranking']['criteria']])
                self.assertLessEqual(item['ranking']['possible_points'],70 if gender!='female' else 72)

    def test_rename_review_is_independent_of_future_filters_and_saved_original(self):
        data={**BASE,'purpose':'rename','currentName':'李明哲'}
        review=server.review_name({**data,'requiredChars':'安','tabooChars':'安','numerologyMode':'strict'})
        self.assertEqual(review['candidates'],[])
        self.assertEqual(review['analysis']['name_review']['version'],'existing-name-v2')
        self.assertEqual(review['analysis']['name_review']['numerology']['grids']['人格']['raw'],15)
        proposed=server.analyze(data)
        self.assertTrue(all(x['name']!='李明哲' for x in proposed['candidates']))
        self.assertEqual(review['analysis']['name_review'],proposed['analysis']['name_review'])

    def test_due_born_and_rename_remain_isolated_with_new_algorithm(self):
        due=server.analyze({**BASE,'mode':'due_date','birthDate':'','birthTime':'','dueDate':'2099-01-01'})
        self.assertTrue(due['analysis']['bazi']['reference'])
        self.assertTrue(due['analysis']['gua']['reference'])
        with self.assertRaisesRegex(ValueError,'due date flow'):
            server.analyze({**BASE,'mode':'due_date','dueDate':'2099-01-01'})
        with self.assertRaisesRegex(ValueError,'born flow'):
            server.analyze({**BASE,'dueDate':'2099-01-01'})

    def test_auxiliary_nayin_and_changsheng_match_library_without_weighting(self):
        chart=bazi.calculate('2024-02-10','12:00','Asia/Shanghai')
        value=naming_auxiliary.calculate(chart)
        ec=Solar.fromYmdHms(2024,2,10,12,0,0).getLunar().getEightChar();ec.setSect(1)
        self.assertEqual([p['changsheng'] for p in value['pillars']],[ec.getYearDiShi(),ec.getMonthDiShi(),ec.getDayDiShi(),ec.getTimeDiShi()])
        self.assertEqual(value['pillars'][0]['nayin'],'覆灯火')

    def test_legacy_api_can_still_replay_old_scheme(self):
        old=server.analyze({k:v for k,v in BASE.items() if k!='algorithm'})
        self.assertEqual(old['analysis']['algorithm'],'legacy_v2')
        self.assertEqual(old['analysis']['available_candidate_count'],30)
        with self.assertRaisesRegex(ValueError,'algorithm'):
            server.analyze({**BASE,'algorithm':'missing'})

class ReferenceIsolationTest(unittest.TestCase):
    def test_prebuilt_reference_snapshot_never_requires_a_writable_lock(self):
        naming_corpus.snapshot.cache_clear()
        naming_corpus.build_database()
        import builtins
        original=builtins.open
        def guarded(path,*args,**kwargs):
            if str(path).endswith('.lock'):
                raise PermissionError('isolated customer process cannot write naming data')
            return original(path,*args,**kwargs)
        with patch('builtins.open',side_effect=guarded):
            value=naming_corpus.snapshot()
        self.assertEqual(len(value['characters']),3636)
        self.assertEqual(naming_corpus.DB.stat().st_mode & 0o777,0o644)

class ContextualSenseTest(unittest.TestCase):
    def test_phrase_specific_meaning_does_not_leak_into_arbitrary_char_combinations(self):
        pool,_=literary_engine.generate_pool(2,{'element':None,'mode':'none'},set(),set(),set(),set(),'',[],server.load_names())
        for item in pool:
            if item['source_kind']=='cross_passage':
                self.assertFalse(set(item['given'])&set('之自离物落杜荡待'))
        self.assertIn('江离',literary_engine.phrases())

class StrokeBoundaryTest(unittest.TestCase):
    def test_known_two_character_stroke_difference_ten_passes_eleven_filters(self):
        common={'styles':['classical'],'genders':['unknown','male','female'],'tags':['字义组合'],'source_status':'pending','source':'现代字义','source_kind':'modern_meaning','citations':[]}
        ten={**common,'given':'川诗','pinyin':'chuān shī','meaning':'开阔明亮'}
        eleven={**common,'given':'川铭','pinyin':'chuān míng','meaning':'开阔持守'}
        self.assertEqual(literary_engine.character('诗')['kangxi_strokes']-literary_engine.character('川')['kangxi_strokes'],10)
        self.assertEqual(literary_engine.character('铭')['kangxi_strokes']-literary_engine.character('川')['kangxi_strokes'],11)
        with patch.object(literary_engine,'generate_pool',return_value=([ten,eleven],{'uncovered_required':[],'searched_characters':3})):
            result=server.analyze(BASE)
        self.assertEqual([x['given'] for x in result['candidates']],['川诗'])
        self.assertEqual(result['analysis']['filters']['stroke_gap'],1)
