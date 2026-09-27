"""CI bootstrap must fail before it can reuse a workstation or previous runner stack."""
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch, Mock

SCRIPT = Path(__file__).resolve().parents[1] / 'ci-acceptance.py'
spec = importlib.util.spec_from_file_location('ci_acceptance', SCRIPT)
ci = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ci)


class BootstrapGuardTests(unittest.TestCase):
    def test_refuses_a_workstation_before_any_command(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(ci, 'run') as run:
            with self.assertRaisesRegex(SystemExit, 'disposable GitHub'):
                ci.bootstrap()
            run.assert_not_called()

    def test_refuses_existing_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            credentials = Path(directory) / '.env.local'
            credentials.write_text('existing')
            with patch.object(ci, 'guard'), patch.object(ci, 'ENV_FILE', credentials), patch.object(ci, 'run') as run:
                with self.assertRaisesRegex(SystemExit, 'already exists'):
                    ci.bootstrap()
                run.assert_not_called()

    def test_refuses_existing_volume_even_without_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(ci, 'guard'), patch.object(ci, 'ENV_FILE', Path(directory) / 'absent'), \
                 patch.object(ci, 'run', side_effect=['', 'existing-volume']) as run, \
                 patch.object(ci.subprocess, 'run', return_value=Mock(returncode=1)):
                with self.assertRaisesRegex(SystemExit, 'fresh runner'):
                    ci.bootstrap()
                self.assertFalse(any(call.args[:2] == ('supabase', 'start') for call in run.call_args_list))

    def test_exports_explicit_backend_origin_and_all_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = Path(directory) / 'github-env'
            values = {'SUPABASE_ANON_KEY': 'public-test-key', 'SUPABASE_SERVICE_ROLE_KEY': 'private-test-key', 'DEMO_PASSWORD': 'fixture-password'}
            with patch.dict(os.environ, {'GITHUB_ENV': str(environment)}), patch('builtins.print'):
                ci.export_environment(values)
            exported = dict(line.split('=', 1) for line in environment.read_text().splitlines())
            self.assertEqual(exported['APP_ORIGIN'], 'http://localhost:3003')
            self.assertNotEqual(exported['ACCEPTANCE_SUPABASE_URL'], ci.API_URL)
            self.assertEqual(exported['ACCEPTANCE_SUPABASE_SERVICE_ROLE_KEY'], values['SUPABASE_SERVICE_ROLE_KEY'])


if __name__ == '__main__':
    unittest.main()
