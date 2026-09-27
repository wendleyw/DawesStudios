"""Regression checks for the temporary overlay's scope and rollback safety."""
import copy
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from sabre_demo_state import ROOT, SCOPES, assert_local, difference, rollback_sql
from sabre_demo import Demo, PLAN, drive_url
import inspect
import re


def empty_snapshot():
    return {'rows': {t: [] for t in SCOPES}, 'keys': {t: ['id'] for t in SCOPES}, 'storage': []}


class SabreDemoTests(unittest.TestCase):
    def test_plan_matches_live_catalog_and_fifty_project_target(self):
        catalog = json.loads((ROOT / 'apps/web/features/briefings/service-catalog.json').read_text())
        formats = {f['id'] for f in catalog['formats']}
        services = {s['id']: s for s in catalog['types']}
        self.assertEqual(len(PLAN['projects']) + 7, 50)
        self.assertEqual(len({p['key'] for p in PLAN['projects']}), 43)
        self.assertGreaterEqual(len({p['service'] for p in PLAN['projects']}), 15)
        for project in PLAN['projects']:
            self.assertIn(project['service'], services)
            self.assertGreater(project['credits'], 0)
            self.assertTrue(project['deliverables'])
            for item in project['deliverables']:
                self.assertIn(item['format'], formats)
                self.assertIn(item['format'], services[project['service']]['formats'])
                self.assertGreater(item['quantity'], 0)
        self.assertEqual({p['stage'] for p in PLAN['projects']}, {'in_progress', 'internal_review', 'client_review', 'changes_requested', 'approved', 'delivered'})

    def test_drive_links_are_valid_and_only_added_by_a_fresh_apply(self):
        # The same pattern as the `project_drive_url_valid` constraint (migration 202609270009).
        pattern = re.compile(r'^https://drive\.google\.com(/\S*)?$')
        links = [drive_url(p['key']) for i, p in enumerate(PLAN['projects']) if i % 10 == 3]
        self.assertGreaterEqual(len(links), 3)
        self.assertTrue(all(pattern.match(url) for url in links))
        self.assertEqual(len(set(links)), len(links))
        self.assertEqual(drive_url('x'), drive_url('x'))
        self.assertIn('set_project_drive_link', inspect.getsource(Demo.populate_project))
        self.assertNotIn('drive', inspect.getsource(Demo.backfill) + inspect.getsource(Demo.populate_miro))

    def test_only_local_backend_is_allowed(self):
        assert_local('http://127.0.0.1:55421')
        for url in ['https://example.supabase.co', 'http://127.0.0.1:54321', 'https://localhost:55421', 'http://localhost:55421/other']:
            with self.assertRaises(RuntimeError):
                assert_local(url)

    def test_rollback_targets_added_primary_keys_and_restores_composite_rows(self):
        before = empty_snapshot()
        before['keys']['public.brand_sections'] = ['client_id', 'section']
        before['rows']['public.brand_sections'] = [{'client_id': 'sabre', 'section': 'overview', 'content': {"name": "Client's original"}}]
        after = copy.deepcopy(before)
        after['rows']['public.brand_sections'][0]['content'] = {'name': 'Demo'}
        after['rows']['public.projects'] = [{'id': 'new-project', 'title': 'Demo'}]
        query = rollback_sql(before, after)
        self.assertIn('delete from public.projects where "id"=\'new-project\';', query)
        self.assertIn('t."client_id"=original."client_id" and t."section"=original."section"', query)
        self.assertIn("Client''s original", query)
        self.assertNotIn('delete from public.clients', query)
        self.assertTrue(query.startswith('begin;'))
        self.assertTrue(query.endswith('commit;'))

    def test_missing_original_rows_block_rollback(self):
        before, after = empty_snapshot(), empty_snapshot()
        before['rows']['public.projects'] = [{'id': 'original'}]
        with self.assertRaisesRegex(RuntimeError, 'Original records were removed'):
            difference(before, after)

    def test_guard_refuses_newer_work_without_sql_or_storage_writes(self):
        before, after = empty_snapshot(), empty_snapshot()
        after['rows']['public.projects'] = [{'id': 'demo'}]
        current = copy.deepcopy(after)
        current['rows']['public.projects'][0]['title'] = 'New user edit'
        demo = Demo.__new__(Demo)
        demo.state = {'phase': 'complete', 'before': before, 'after': after}
        with patch('sabre_demo.snapshot', return_value=current), patch('sabre_demo.sql') as sql, patch.object(demo, 'request') as request:
            with self.assertRaisesRegex(RuntimeError, 'SABRE changed'):
                demo.remove()
            sql.assert_not_called()
            request.assert_not_called()

    def test_interrupted_removal_does_not_delete_files_after_unexpected_edit(self):
        before, after = empty_snapshot(), empty_snapshot()
        after['rows']['public.projects'] = [{'id': 'demo'}]
        current = copy.deepcopy(after)
        current['rows']['public.projects'].append({'id': 'new-user-project'})
        demo = Demo.__new__(Demo)
        demo.state = {'phase': 'removing', 'before': before, 'after': after}
        with patch('sabre_demo.snapshot', return_value=current), patch.object(demo, 'request') as request:
            with self.assertRaisesRegex(RuntimeError, 'unexpected database changes'):
                demo.remove()
            request.assert_not_called()


if __name__ == '__main__':
    unittest.main()
