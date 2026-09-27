"""Safety regressions for the local backup and disposable restore tools."""

from contextlib import redirect_stdout
from io import BytesIO, StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase, main, mock
import json
import tarfile

import backup_local
import restore_drill


def make_archive(path, entries):
    with tarfile.open(path, 'w:gz') as archive:
        for name, content, kind in entries:
            member = tarfile.TarInfo(name)
            if kind == 'file':
                member.size = len(content)
                archive.addfile(member, BytesIO(content))
            elif kind == 'directory':
                member.type = tarfile.DIRTYPE
                archive.addfile(member)
            else:
                member.type = tarfile.SYMTYPE if kind == 'symlink' else tarfile.LNKTYPE
                member.linkname = 'outside'
                archive.addfile(member)


def make_backup(root):
    backup = root / 'backup'
    backup.mkdir()
    (backup / 'database.dump').write_bytes(b'custom PostgreSQL dump fixture')
    archive = backup / 'storage.tar.gz'
    make_archive(archive, [('stub/stub/delivery-files/project/report.pdf/version',
                            b'%PDF-1.7 expected', 'file')])
    inventory = backup_local.archive_inventory(archive)
    probe = {'bucket_id': 'delivery-files', 'name': 'project/report.pdf',
             'version': 'version', **next(iter(inventory.values()))}
    manifest = {'format_version': 2, 'project_id': backup_local.PROJECT,
                'files': {name: backup_local.digest_file(backup / name)
                          for name in backup_local.FILES},
                'storage_inventory': inventory, 'delivery_probe': probe,
                'counts': {'clients': 1, 'projects': 1, 'boards': 2}}
    (backup / 'manifest.json').write_text(json.dumps(manifest))
    return backup, manifest


class BackupValidationTests(TestCase):
    def test_rejects_modified_dump_and_archive(self):
        for name in sorted(backup_local.FILES):
            with self.subTest(name=name), TemporaryDirectory() as directory:
                backup, _ = make_backup(Path(directory))
                with (backup / name).open('ab') as output:
                    output.write(b'altered')
                with self.assertRaisesRegex(RuntimeError, 'checksum'):
                    restore_drill.validate_backup(backup)

    def test_rejects_manifest_path_traversal_and_symlinked_dump(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            backup, manifest = make_backup(root)
            manifest['files']['../outside'] = '0' * 64
            (backup / 'manifest.json').write_text(json.dumps(manifest))
            with self.assertRaisesRegex(RuntimeError, 'exactly'):
                restore_drill.validate_backup(backup)
            manifest['files'].pop('../outside')
            (backup / 'manifest.json').write_text(json.dumps(manifest))
            outside = root / 'outside'
            outside.write_bytes((backup / 'database.dump').read_bytes())
            (backup / 'database.dump').unlink()
            (backup / 'database.dump').symlink_to(outside)
            with self.assertRaisesRegex(RuntimeError, 'symbolic link'):
                restore_drill.validate_backup(backup)

    def test_rejects_unsafe_archive_even_when_outer_hash_matches(self):
        for name, kind in [('../escape', 'file'), ('/absolute', 'file'),
                           ('stub/shortcut', 'symlink'), ('stub/hardlink', 'hardlink')]:
            with self.subTest(name=name), TemporaryDirectory() as directory:
                backup, manifest = make_backup(Path(directory))
                make_archive(backup / 'storage.tar.gz', [(name, b'payload', kind)])
                manifest['files']['storage.tar.gz'] = backup_local.digest_file(
                    backup / 'storage.tar.gz')
                (backup / 'manifest.json').write_text(json.dumps(manifest))
                with self.assertRaisesRegex(RuntimeError, 'unsafe entry'):
                    restore_drill.validate_backup(backup)

    def test_rejects_duplicate_archive_files(self):
        with TemporaryDirectory() as directory:
            archive = Path(directory) / 'storage.tar.gz'
            make_archive(archive, [('same', b'first', 'file'),
                                   ('same', b'second', 'file')])
            with self.assertRaisesRegex(RuntimeError, 'duplicate files'):
                backup_local.archive_inventory(archive)


class ForeignKeyAuditTests(TestCase):
    def test_rejects_historical_orphans_even_when_constraints_are_marked_valid(self):
        constraint = {'name': 'child_parent_fkey', 'child': 'public.child',
                      'parent': 'public.parent', 'columns': ['parent_id'], 'references': ['id']}
        query = mock.Mock(side_effect=[[constraint], [{'constraint_name': constraint['name'], 'orphans': 4}]])
        with self.assertRaisesRegex(RuntimeError, 'child_parent_fkey'):
            backup_local.audit_foreign_keys(query)

    def test_accepts_valid_relationships_and_refuses_missing_schema(self):
        constraint = {'name': 'child_parent_fkey', 'child': 'public.child',
                      'parent': 'public.parent', 'columns': ['parent_id'], 'references': ['id']}
        self.assertEqual(backup_local.audit_foreign_keys(mock.Mock(side_effect=[[constraint], []])), 1)
        with self.assertRaisesRegex(RuntimeError, 'missing'):
            backup_local.audit_foreign_keys(mock.Mock(return_value=[]))


class RestoreOwnershipTests(TestCase):
    def test_refuses_incomplete_database_ownership(self):
        with TemporaryDirectory() as directory, mock.patch.object(
                restore_drill, 'RUNS', Path(directory).resolve()):
            project = 'dawes-restore-' + 'a' * 12
            empty = {'container': {}, 'volume': {}, 'network': {}}
            with mock.patch.object(restore_drill, 'resources', return_value=empty):
                with self.assertRaisesRegex(RuntimeError, 'ownership is incomplete'):
                    restore_drill.assert_owned({'project_id': project, 'resources': empty},
                                               Path(directory).resolve() / project)

    def test_refuses_changed_resources_and_foreign_workdir(self):
        with TemporaryDirectory() as directory, mock.patch.object(
                restore_drill, 'RUNS', Path(directory).resolve()):
            project = 'dawes-restore-' + 'a' * 12
            work = Path(directory).resolve() / project
            target = {'project_id': project, 'resources': {'container': {'db': 'original'}}}
            with mock.patch.object(restore_drill, 'resources', return_value={
                    'container': {'db': 'replaced'}}):
                with self.assertRaisesRegex(RuntimeError, 'resources changed'):
                    restore_drill.assert_owned(target, work)
            with mock.patch.object(restore_drill, 'resources') as resources:
                with self.assertRaisesRegex(RuntimeError, 'outside its owned'):
                    restore_drill.assert_owned(target, Path(directory).resolve())
                resources.assert_not_called()

    def test_refuses_existing_project_before_start(self):
        with TemporaryDirectory() as directory, mock.patch.object(
                restore_drill, 'RUNS', Path(directory).resolve()), mock.patch.object(
                restore_drill.uuid, 'uuid4') as uuid4, mock.patch.object(
                restore_drill, 'validate_backup', return_value={}):
            uuid4.return_value.hex = 'a' * 32
            with mock.patch.object(restore_drill, 'resources', return_value={
                    'container': {'existing': 'id'}, 'volume': {}, 'network': {}}), \
                    mock.patch.object(restore_drill, 'command') as command:
                with redirect_stdout(StringIO()), self.assertRaisesRegex(
                        RuntimeError, 'already has Docker resources'):
                    restore_drill.drill(Path(directory) / 'backup')
                command.assert_not_called()

    def test_verify_only_rejects_backup_from_other_run(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            backup, _ = make_backup(root)
            work = root / 'work'
            work.mkdir()
            (work / 'target.json').write_text(json.dumps({'manifest_sha256': 'wrong'}))
            with mock.patch.object(restore_drill, 'assert_owned') as owned, \
                    mock.patch.object(restore_drill, 'command') as command:
                with self.assertRaisesRegex(RuntimeError, 'different backup'):
                    restore_drill.verify_restore(backup, work)
                owned.assert_not_called()
                command.assert_not_called()


class RestoredContentTests(TestCase):
    def test_rejects_altered_pdf_with_same_header_and_length(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            backup, manifest = make_backup(root)
            work = root / 'work'
            work.mkdir()
            (work / 'target.json').write_text(json.dumps({
                'manifest_sha256': backup_local.digest_file(backup / 'manifest.json'),
                'project_id': 'dawes-restore-' + 'a' * 12, 'api_port': 56521}))
            fixture = root / 'supabase'
            fixture.mkdir()
            (fixture / '.env.local').write_text('DEMO_PASSWORD=test-only\n')
            status = {'API_URL': 'http://127.0.0.1:56521', 'ANON_KEY': 'test'}
            boards = [{'id': 'board1', 'designer_id': 'designer1'},
                      {'id': 'board2', 'designer_id': 'designer2'}]

            def fake_api(_status, path, *, token=None, data=None):
                if path.startswith('/auth/v1/token'):
                    email = data['email']
                    identity = {'studio@dawes.local': 'agency',
                                'sabre@client.dawes.local': 'client',
                                'designer@dawes.local': 'designer1',
                                'designer2@dawes.local': 'designer2'}[email]
                    return {'access_token': identity, 'user': {'id': identity}}
                if path.startswith('/storage/v1/object/'):
                    return b'%PDF-1.7 modified'  # Same format and length; different bytes.
                raise AssertionError(path)

            def fake_rows(_status, table, token, columns='*'):
                if token == 'agency':
                    return {'clients': [{'id': 'client-id'}],
                            'projects': [{'id': 'project-id'}],
                            'design_boards': boards}[table]
                if token == 'client':
                    return {'clients': [{'id': 'client-id'}],
                            'projects': [{'client_id': 'client-id'}],
                            'design_boards': [], 'design_versions': [],
                            'internal_comments': []}[table]
                return [board for board in boards if board['designer_id'] == token]

            self.assertEqual(len(b'%PDF-1.7 expected'), len(b'%PDF-1.7 modified'))
            with mock.patch.object(restore_drill, 'ROOT', root), \
                    mock.patch.object(restore_drill, 'assert_owned'), \
                    mock.patch.object(restore_drill, 'command', return_value=json.dumps(status).encode()), \
                    mock.patch.object(restore_drill, 'database', return_value=json.dumps(manifest['counts'])), \
                    mock.patch.object(restore_drill, 'audit_foreign_keys', return_value=118), \
                    mock.patch.object(restore_drill, 'api', side_effect=fake_api), \
                    mock.patch.object(restore_drill, 'rows', side_effect=fake_rows):
                with self.assertRaisesRegex(RuntimeError, 'delivery bytes differ'):
                    restore_drill.verify_restore(backup, work)


if __name__ == '__main__':
    main()
