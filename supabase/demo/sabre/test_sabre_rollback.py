"""Rollback, schema-tolerance and Miro-history checks for the SABRE overlay scripts (no database).

    python3 -m unittest supabase/demo/sabre/test_sabre_rollback.py -v
"""
import copy
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from sabre_demo_state import SCOPES, rollback_sql, rows_match  # noqa: E402
from sabre_demo import Demo, history_times, miro_url  # noqa: E402

OLD_SCOPES = [t for t in SCOPES if t not in ('public.design_boards', 'public.project_covers')] + ['public.designs']


def snap(tables, **rows):
    value = {'rows': {t: [] for t in tables}, 'keys': {t: ['id'] for t in tables}, 'storage': []}
    value['keys'].update({'public.credit_months': ['client_id', 'month'], 'public.project_covers': ['project_id']})
    for table, table_rows in rows.items():
        value['rows'][table.replace('__', '.')] = table_rows
    return value


def demo(state):
    instance = Demo.__new__(Demo)
    instance.state = state
    return instance


def run_remove(instance, snapshots):
    """Run a full removal against a scripted sequence of snapshots; returns (sql calls, requests)."""
    calls = []
    with patch('sabre_demo.snapshot', side_effect=[copy.deepcopy(s) for s in snapshots]), \
         patch('sabre_demo.sql', side_effect=calls.append), patch('sabre_demo.save'), \
         patch.object(instance, 'request') as request, patch('sabre_demo.STATE_PATH') as path:
        path.with_name.return_value.relative_to.return_value = 'removed-demo.json'
        instance.remove()
    return calls, request


class CreditMonths(unittest.TestCase):
    def test_apply_that_spends_a_month_balance_is_restored_by_remove(self):
        month = {'client_id': 'sabre', 'month': '2026-09-01', 'balance': 40, 'status': 'open'}
        before = snap(SCOPES, public__credit_months=[month], public__credit_accounts=[{'id': 'sabre', 'balance': 40}])
        after = copy.deepcopy(before)
        after['rows']['public.credit_months'][0]['balance'] = 12
        after['rows']['public.credit_accounts'][0]['balance'] = 12
        after['rows']['public.projects'] = [{'id': 'demo'}]
        calls, _ = run_remove(demo({'phase': 'complete', 'canary': False, 'before': before, 'after': after}),
                              [after, after, before])
        self.assertEqual(len(calls), 1)
        self.assertIn('update public.credit_months t set', calls[0])
        self.assertIn('"balance":40', calls[0].replace(' ', ''))
        self.assertIn('t."client_id"=original."client_id" and t."month"=original."month"', calls[0])
        self.assertIn('update public.credit_accounts t set', calls[0])


class SchemaTolerance(unittest.TestCase):
    def setUp(self):
        self.saved = snap(SCOPES, public__projects=[{'id': 'p1', 'status': 'approved', 'legacy': 'x'}])

    def current(self, **extra):
        value = snap(SCOPES, public__projects=[{'id': 'p1', 'status': 'approved', **extra}])
        return value

    def test_added_null_column_and_dropped_column_match(self):
        self.assertTrue(rows_match(self.saved, self.current(added_column=None), SCOPES))

    def test_added_column_with_a_value_does_not_match(self):
        self.assertFalse(rows_match(self.saved, self.current(added_column='x'), SCOPES))

    def test_changed_shared_column_does_not_match(self):
        current = self.current(added_column=None)
        current['rows']['public.projects'][0]['status'] = 'delivered'
        self.assertFalse(rows_match(self.saved, current, SCOPES))

    def test_guard_accepts_new_null_column_and_restore_skips_dropped_column(self):
        before = copy.deepcopy(self.saved)
        after = copy.deepcopy(before)
        after['rows']['public.projects'][0]['status'] = 'delivered'
        current = copy.deepcopy(after)
        current['rows']['public.projects'][0].pop('legacy')
        current['rows']['public.projects'][0]['added_column'] = None
        current['columns'] = {'public.projects': ['id', 'status', 'added_column']}
        restored = copy.deepcopy(before)
        restored['rows']['public.projects'][0].pop('legacy')
        restored['rows']['public.projects'][0]['added_column'] = None
        calls, _ = run_remove(demo({'phase': 'complete', 'canary': False, 'before': before, 'after': after}),
                              [current, current, restored])
        self.assertIn('set ("status")=(original."status")', calls[0])
        self.assertNotIn('"legacy"=', calls[0].split('from json_populate_record')[0])


class Layers(unittest.TestCase):
    def setUp(self):
        self.b0 = snap(OLD_SCOPES)
        self.a0 = snap(OLD_SCOPES, public__projects=[{'id': 'p1', 'status': 'approved'}], public__designs=[{'id': 'legacy'}])
        self.a0['storage'] = [{'bucket': 'internal-assets', 'path': 'p1/a.png', 'size': '1'}]
        self.b1 = snap(SCOPES, public__projects=[{'id': 'p1', 'status': 'approved'}])
        self.b1['storage'] = list(self.a0['storage'])
        self.a1 = copy.deepcopy(self.b1)
        self.a1['rows']['public.design_boards'] = [{'id': 'b1'}]
        self.a1['rows']['public.project_covers'] = [{'project_id': 'p1', 'client_visible': True}]
        self.a1['storage'] = self.b1['storage'] + [{'bucket': 'project-covers', 'path': 'p1/c.png', 'size': '1'}]

    def state(self, phase='complete'):
        return {'phase': phase, 'canary': False, 'before': self.b0, 'after': self.a0,
                'backfill': {'phase': 'complete', 'before': self.b1, 'after': self.a1}}

    def test_old_checkpoint_ignores_dropped_and_missing_tables(self):
        query = rollback_sql(self.b0, self.a0)
        self.assertIn('delete from public.projects where "id"=\'p1\';', query)
        self.assertNotIn('public.designs', query)
        self.assertNotIn('design_boards', query)

    def test_dry_run_is_write_free(self):
        instance = demo(self.state())
        with patch('sabre_demo.snapshot', return_value=copy.deepcopy(self.a1)), patch('sabre_demo.sql') as sql, \
             patch('sabre_demo.save') as save, patch.object(instance, 'request') as request:
            instance.remove(dry_run=True)
            sql.assert_not_called(); save.assert_not_called(); request.assert_not_called()

    def test_change_between_layers_refuses_before_writing(self):
        for value in (self.b1, self.a1):
            value['rows']['public.projects'][0]['status'] = 'delivered'
        instance = demo(self.state())
        with patch('sabre_demo.snapshot', return_value=copy.deepcopy(self.a1)), patch('sabre_demo.sql') as sql, \
             patch.object(instance, 'request') as request:
            with self.assertRaisesRegex(RuntimeError, 'between population and the Miro backfill'):
                instance.remove(dry_run=True)
            sql.assert_not_called(); request.assert_not_called()

    def test_full_removal_peels_newest_layer_first_and_deletes_every_added_file(self):
        calls, request = run_remove(demo(self.state()), [self.a1, self.a1, self.b1, snap(SCOPES)])
        self.assertIn('design_boards', calls[0])
        self.assertIn('public.projects', calls[1])
        deleted = {(c.args[0], tuple(c.args[1]['prefixes'])) for c in request.call_args_list}
        self.assertEqual(deleted, {('/storage/v1/object/internal-assets', ('p1/a.png',)),
                                   ('/storage/v1/object/project-covers', ('p1/c.png',))})

    def test_incomplete_backfill_blocks_removal(self):
        state = self.state()
        state['backfill']['phase'] = 'applying'
        with self.assertRaisesRegex(RuntimeError, 'incomplete'):
            demo(state).remove(dry_run=True)

    def test_new_populated_table_missing_from_all_layers_blocks_before_any_write(self):
        state = self.state()
        table = 'public.project_drive_links'
        for layer in [state, state['backfill']]:
            for name in ['before', 'after']:
                layer[name]['rows'].pop(table, None)
                layer[name]['keys'].pop(table, None)
        current = copy.deepcopy(self.a1)
        current['rows'][table] = [{'project_id': 'p1', 'channel': 'client', 'url': 'https://drive.google.com/folder'}]
        for phase in ['complete', 'removing']:
            for dry_run in [True, False]:
                state['phase'] = phase
                instance = demo(state)
                with self.subTest(phase=phase, dry_run=dry_run), \
                     patch('sabre_demo.snapshot', return_value=current), patch('sabre_demo.sql') as sql, \
                     patch('sabre_demo.save') as save, patch.object(instance, 'request') as request:
                    with self.assertRaisesRegex(RuntimeError, 'checkpoint does not cover.*project_drive_links'):
                        instance.remove(dry_run=dry_run)
                    sql.assert_not_called(); save.assert_not_called(); request.assert_not_called()

    def test_new_empty_table_does_not_block_removal(self):
        state = self.state()
        for layer in [state, state['backfill']]:
            for name in ['before', 'after']:
                layer[name]['rows'].pop('public.project_drive_links', None)
                layer[name]['keys'].pop('public.project_drive_links', None)
        instance = demo(state)
        with patch('sabre_demo.snapshot', return_value=copy.deepcopy(self.a1)), patch('sabre_demo.sql') as sql:
            instance.remove(dry_run=True)
            sql.assert_not_called()


class MiroHistory(unittest.TestCase):
    def test_history_stays_on_or_before_the_end_date_in_order(self):
        for start, end, cycles in [(date(2026, 2, 1), date(2026, 2, 22), 2), (date(2026, 3, 5), date(2026, 3, 5), 2),
                                   (date(2026, 4, 10), date(2026, 4, 1), 1)]:
            times = history_times(start, end, cycles)
            flat = [t for pair in times for t in pair]
            self.assertEqual(flat, sorted(flat))
            self.assertLessEqual(flat[-1] + timedelta(hours=3),
                                 datetime(end.year, end.month, end.day, 23, 59, tzinfo=timezone.utc))

    def test_second_version_links_to_the_board_its_round_came_from(self):
        instance = demo({'steps': {}})
        instance.users = {'designer': 'd1', 'designer2': 'd2'}
        boards = [{'id': 'board-a', 'designer_id': 'd1'}, {'id': 'board-b', 'designer_id': 'd2'}]
        shares = []
        def rows(table, query='', role='agency'):
            return {'projects': [{'start_date': '2026-02-01', 'due_date': '2026-02-20'}],
                    'project_assignments': [{'designer_id': 'd1'}, {'designer_id': 'd2'}],
                    'design_boards': boards, 'project_covers': [{'project_id': 'p'}]}.get(table, [])
        def rpc(name, data, role='agency'):
            if name == 'share_miro_version':
                shares.append(data)
            return name + str(len(shares)) + data.get('p_board_id', '')
        plan = {'key': 'k', 'campaign': 0, 'title': 'T', 'stage': 'approved'}
        with patch.object(instance, 'rows', side_effect=rows), patch.object(instance, 'rpc', side_effect=rpc), \
             patch('sabre_demo.save'), patch('sabre_demo.miro_history', return_value=['changes_requested', 'approved']):
            instance.populate_miro(plan, 'p', 0, preserve=False)
        self.assertTrue(shares[0]['p_url'].startswith(miro_url('k:board:0')))
        self.assertTrue(shares[1]['p_url'].startswith(miro_url('k:board:1')))
        self.assertTrue(shares[1]['p_source_round'].endswith('board-b'))


class Sessions(unittest.TestCase):
    def test_status_and_remove_sign_in_no_user(self):
        with patch.object(Demo, 'request') as request:
            Demo(sign_in=False)
            request.assert_not_called()


if __name__ == '__main__':
    unittest.main()
