"""Read-only configuration checks for the two staging storage variants."""

import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest


STAGING_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = STAGING_DIR.parents[1]
UPSTREAM = STAGING_DIR / ".upstream" / "docker"
REFERENCE = "registry.example.test/dawes-web@sha256:" + "a" * 64
MEDIA_REFERENCE = "registry.example.test/dawes-media@sha256:" + "b" * 64


def dummy_env(compose_files, path, **overrides):
    """Provide inert values for every interpolated variable without reading local secrets."""
    names = set()
    for compose_file in compose_files:
        names.update(re.findall(r"\$\{([A-Za-z_][A-Za-z0-9_]*)", compose_file.read_text()))
    values = {name: "dummy" for name in names}
    values.update(
        STAGING_GATEWAY_PORT="56110",
        STAGING_DB_PORT="56111",
        STAGING_MINIO_API_PORT="56012",
        STAGING_MINIO_CONSOLE_PORT="56013",
        POSTGRES_PORT="5432",
        POOLER_PROXY_PORT_TRANSACTION="6543",
        API_GW_HTTP_PORT="56110",
        KONG_HTTP_PORT="56110",
        WEB_PORT="3113",
        MEDIA_PORT="56114",
        FILE_SIZE_LIMIT="52428800",
        NEXT_PUBLIC_SUPABASE_URL="http://localhost:56110",
        NEXT_PUBLIC_MEDIA_URL="http://localhost:56114",
        SUPABASE_INTERNAL_URL="http://host.docker.internal:56110",
        APP_ORIGIN="http://localhost:3113",
        WEB_IMAGE=REFERENCE,
        MEDIA_IMAGE=MEDIA_REFERENCE,
    )
    values.update(overrides)
    path.write_text("\n".join(f"{key}={value}" for key, value in sorted(values.items())) + "\n")
    path.chmod(0o600)


def compose_config(project, env_file, compose_files):
    command = ["docker", "compose", "-p", project, "--env-file", str(env_file)]
    for compose_file in compose_files:
        command.extend(["-f", str(compose_file)])
    command.extend(["config", "--format", "json"])
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode:
        raise AssertionError(result.stderr)
    return json.loads(result.stdout)


@unittest.skipUnless(shutil.which("docker") and UPSTREAM.is_dir(), "Docker Compose and pinned upstream are required")
class StagingComposeTests(unittest.TestCase):
    def test_filesystem_variant_uses_upstream_file_backend_and_shared_named_volume(self):
        with tempfile.TemporaryDirectory() as temp:
            work = Path(temp) / ".work-file" / "docker"
            work.mkdir(parents=True)
            base = work / "docker-compose.yml"
            shutil.copyfile(UPSTREAM / "docker-compose.yml", base)
            override = STAGING_DIR / "compose.filesystem.override.yml"
            env_file = Path(temp) / "dummy.env"
            dummy_env([base, override], env_file)

            config = compose_config("dawes-staging-file", env_file, [base, override])

            self.assertNotIn("minio", config["services"])
            self.assertNotIn("minio-createbucket", config["services"])
            storage = config["services"]["storage"]
            self.assertEqual(storage["environment"]["STORAGE_BACKEND"], "file")
            self.assertEqual(storage["environment"]["FILE_STORAGE_BACKEND_PATH"], "/var/lib/storage")
            self.assertEqual(storage["environment"]["FILE_SIZE_LIMIT"], "52428800")
            self.assertNotIn("GLOBAL_S3_ENDPOINT", storage["environment"])
            self.assertNotIn("AWS_ACCESS_KEY_ID", storage["environment"])
            storage_mount = next(m for m in storage["volumes"] if m["target"] == "/var/lib/storage")
            imgproxy_mount = next(m for m in config["services"]["imgproxy"]["volumes"] if m["target"] == "/var/lib/storage")
            self.assertEqual(len(storage["volumes"]), 1)
            self.assertEqual(len(config["services"]["imgproxy"]["volumes"]), 1)
            self.assertEqual(storage_mount["type"], "volume")
            self.assertEqual(storage_mount["source"], "staging-storage")
            self.assertEqual(config["volumes"]["staging-storage"]["name"], "dawes-staging-file_staging-storage")
            self.assertEqual(imgproxy_mount["type"], "volume")
            self.assertEqual(imgproxy_mount["source"], storage_mount["source"])
            self.assertEqual(config["services"]["realtime"]["networks"]["default"]["aliases"], ["realtime-dev.supabase-realtime"])
            self.assertEqual(config["services"]["db"]["container_name"], "dawes-staging-file-db")

    def test_historical_minio_variant_retains_s3_backend(self):
        with tempfile.TemporaryDirectory() as temp:
            work = Path(temp) / ".work" / "docker"
            work.mkdir(parents=True)
            base = work / "docker-compose.yml"
            s3 = work / "docker-compose.s3.yml"
            shutil.copyfile(UPSTREAM / "docker-compose.yml", base)
            shutil.copyfile(UPSTREAM / "docker-compose.s3.yml", s3)
            override = STAGING_DIR / "compose.supabase.override.yml"
            env_file = Path(temp) / "dummy.env"
            dummy_env([base, s3, override], env_file, STAGING_GATEWAY_PORT="56010", STAGING_DB_PORT="56011", FILE_SIZE_LIMIT="1073741824")

            config = compose_config("dawes-staging", env_file, [base, s3, override])

            self.assertIn("minio", config["services"])
            self.assertEqual(config["services"]["storage"]["environment"]["STORAGE_BACKEND"], "s3")
            self.assertEqual(config["services"]["storage"]["environment"]["FILE_SIZE_LIMIT"], "1073741824")

    def test_application_images_accept_immutable_references(self):
        with tempfile.TemporaryDirectory() as temp:
            for compose_file, project in (
                (REPO_ROOT / "compose.yaml", "dawes-studios-app"),
                (STAGING_DIR / "compose.app.yml", "dawes-staging-file-app"),
            ):
                with self.subTest(compose_file=compose_file):
                    env_file = Path(temp) / "dummy.env"
                    dummy_env([compose_file], env_file)
                    config = compose_config(project, env_file, [compose_file])
                    self.assertEqual(config["services"]["web"]["image"], REFERENCE)
                    self.assertEqual(config["services"]["media"]["image"], MEDIA_REFERENCE)

    def test_application_images_keep_local_defaults_without_selectors(self):
        with tempfile.TemporaryDirectory() as temp:
            for compose_file, project, expected_suffix in (
                (REPO_ROOT / "compose.yaml", "dawes-studios-app", "local"),
                (STAGING_DIR / "compose.app.yml", "dawes-staging-app", "staging"),
            ):
                with self.subTest(compose_file=compose_file):
                    env_file = Path(temp) / "dummy.env"
                    dummy_env([compose_file], env_file)
                    values = [line for line in env_file.read_text().splitlines() if not line.startswith(("WEB_IMAGE=", "MEDIA_IMAGE="))]
                    env_file.write_text("\n".join(values) + "\n")
                    process_env = os.environ.copy()
                    process_env.pop("WEB_IMAGE", None)
                    process_env.pop("MEDIA_IMAGE", None)
                    command = ["docker", "compose", "-p", project, "--env-file", str(env_file), "-f", str(compose_file), "config", "--format", "json"]
                    result = subprocess.run(command, capture_output=True, text=True, check=True, env=process_env)
                    config = json.loads(result.stdout)
                    self.assertEqual(config["services"]["web"]["image"], f"dawes-studios-web:{expected_suffix}")
                    self.assertEqual(config["services"]["media"]["image"], f"dawes-studios-media:{expected_suffix}")


class StageModeTests(unittest.TestCase):
    def test_prepare_keeps_modes_in_separate_work_directories_and_ports(self):
        with tempfile.TemporaryDirectory() as temp:
            staging = Path(temp) / "deploy" / "staging"
            (staging / "scripts").mkdir(parents=True)
            (staging / ".upstream" / "docker").mkdir(parents=True)
            shutil.copyfile(STAGING_DIR / "scripts" / "stage.sh", staging / "scripts" / "stage.sh")
            (staging / ".upstream" / "docker" / "placeholder").write_text("pinned fixture\n")

            for mode, work_name, gateway, limit in (
                ("minio", ".work", "56010", "1073741824"),
                ("file", ".work-file", "56110", "52428800"),
            ):
                env = os.environ.copy()
                env["STAGING_STORAGE"] = mode
                subprocess.run(["bash", str(staging / "scripts" / "stage.sh"), "prepare"], env=env, capture_output=True, text=True, check=True)
                values = dict(line.split("=", 1) for line in (staging / work_name / ".env").read_text().splitlines() if line and not line.startswith("#"))
                self.assertEqual(values["STAGING_GATEWAY_PORT"], gateway)
                self.assertEqual(values["FILE_SIZE_LIMIT"], limit)
                self.assertEqual((staging / work_name / ".env").stat().st_mode & 0o777, 0o600)
                if mode == "file":
                    self.assertEqual((staging / work_name).stat().st_mode & 0o777, 0o700)
                    self.assertEqual(values["WEB_IMAGE"], "dawes-studios-web:staging-file")
                    self.assertEqual(values["MEDIA_IMAGE"], "dawes-studios-media:staging-file")
                    before = (staging / work_name / ".env").read_bytes()
                    refused = subprocess.run(["bash", str(staging / "scripts" / "stage.sh"), "prepare", "--force"], env=env, capture_output=True, text=True)
                    self.assertNotEqual(refused.returncode, 0)
                    self.assertIn("refuses --force", refused.stderr)
                    self.assertEqual((staging / work_name / ".env").read_bytes(), before)
                else:
                    self.assertNotIn("WEB_IMAGE", values)
            self.assertNotIn("MINIO_ROOT_USER", dict(line.split("=", 1) for line in (staging / ".work-file" / ".env").read_text().splitlines() if line and not line.startswith("#")))
            self.assertTrue((staging / ".work" / "docker" / "placeholder").exists())
            self.assertTrue((staging / ".work-file" / "docker" / "placeholder").exists())

            bin_dir = Path(temp) / "bin"
            bin_dir.mkdir()
            docker_calls = Path(temp) / "docker-calls.txt"
            fake_docker = bin_dir / "docker"
            fake_docker.write_text(
                '#!/bin/sh\nprintf "%s\\n" "$*" >> "$DOCKER_CALLS"\n'
                '[ -z "${IMAGE_CALLS:-}" ] || printf "%s %s\\n" "$WEB_IMAGE" "$MEDIA_IMAGE" >> "$IMAGE_CALLS"\n'
            )
            fake_docker.chmod(0o755)
            for mode, work_name in (("minio", ".work"), ("file", ".work-file")):
                env = os.environ.copy()
                env.update(STAGING_STORAGE=mode, PATH=f"{bin_dir}{os.pathsep}{env['PATH']}", DOCKER_CALLS=str(docker_calls))
                result = subprocess.run(["bash", str(staging / "scripts" / "stage.sh"), "down"], env=env, capture_output=True, text=True, check=True)
                self.assertIn("down -v", result.stdout)
                self.assertIn(f"STAGING_STORAGE={mode} ", result.stdout)
                self.assertTrue((staging / work_name / ".env").exists())
                self.assertTrue((staging / work_name / "docker" / "placeholder").exists())
            self.assertEqual(len(docker_calls.read_text().splitlines()), 4)
            self.assertTrue(all(call.endswith(" stop") for call in docker_calls.read_text().splitlines()))

            image_calls = Path(temp) / "image-calls.txt"
            env = os.environ.copy()
            env.update(
                STAGING_STORAGE="file",
                PATH=f"{bin_dir}{os.pathsep}{env['PATH']}",
                DOCKER_CALLS=str(docker_calls),
                IMAGE_CALLS=str(image_calls),
                WEB_IMAGE=REFERENCE,
                MEDIA_IMAGE=MEDIA_REFERENCE,
            )
            subprocess.run(["bash", str(staging / "scripts" / "stage.sh"), "app-up"], env=env, capture_output=True, text=True, check=True)
            self.assertTrue(all(line == f"{REFERENCE} {MEDIA_REFERENCE}" for line in image_calls.read_text().splitlines()))


if __name__ == "__main__":
    unittest.main()
