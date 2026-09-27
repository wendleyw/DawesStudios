"""Public-edge contract tests. Integration runs in isolated disposable Docker containers."""
import http.client
import importlib.util
import json
import os
from pathlib import Path
import shutil
import ssl
import socket
import subprocess
import tempfile
import time
import unittest
import uuid

DIRECTORY = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("render_proxy", DIRECTORY / "render_proxy.py")
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)
HOSTS = dict(app_host="app.dawes.test", api_host="api.dawes.test", media_host="media.dawes.test")


class RenderTests(unittest.TestCase):
    def test_rejects_config_injection_and_duplicate_hosts(self):
        for key, value in [("app_host", "app.test; return 200"), ("api_host", HOSTS["app_host"]),
                           ("certificate_root", "/certs/../secrets"),
                           ("web_upstream", "127.0.0.1:3003;"), ("https_port", 0)]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                renderer.render(**{**HOSTS, key: value})

    def test_alternate_tls_port_is_preserved(self):
        config = renderer.render(**HOSTS, https_port=8443)
        self.assertIn("https://$host:8443$request_uri", config)
        self.assertIn("X-Forwarded-Port 8443;", config)

    def test_renders_no_unresolved_tokens_or_credentials(self):
        config = renderer.render(**HOSTS)
        self.assertNotIn("@@", config)
        self.assertIn("proxy_next_upstream off", config)
        self.assertIn('"$request_method $uri"', config)
        self.assertNotIn("$args", config)


@unittest.skipUnless(os.environ.get("RUN_PROXY_INTEGRATION") == "1", "Set RUN_PROXY_INTEGRATION=1 for isolated Docker checks")
class ProxyIntegration(unittest.TestCase):
    @classmethod
    def command(cls, *args):
        return subprocess.run(args, check=True, capture_output=True, text=True).stdout.strip()

    @classmethod
    def setUpClass(cls):
        cls.prefix = "dawes-proxy-test-" + uuid.uuid4().hex[:10]
        cls.directory = Path(tempfile.mkdtemp(prefix=cls.prefix))
        cls.image = os.environ.get("PROXY_TEST_IMAGE", "nginx:stable-alpine")
        cls.addClassCleanup(cls.cleanup)
        cert = cls.directory / "certs"
        cert.mkdir()
        cls.command("openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
                    "-subj", "/CN=*.dawes.test", "-addext", "subjectAltName=DNS:*.dawes.test",
                    "-keyout", str(cert / "key.pem"), "-out", str(cert / "cert.pem"))
        for host in HOSTS.values():
            (cert / host).mkdir()
            shutil.copyfile(cert / "key.pem", cert / host / "privkey.pem")
            shutil.copyfile(cert / "cert.pem", cert / host / "fullchain.pem")
        # A fixed upstream records the effective request. No application or database data is used.
        (cls.directory / "stub.py").write_text('''from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args): pass
 def do_GET(self):
  if self.headers.get('Upgrade','').lower() == 'websocket':
   self.send_response(101); self.send_header('Upgrade','websocket'); self.send_header('Connection','Upgrade'); self.end_headers(); return
  content=json.dumps({'path':self.path,'forwarded':self.headers.get('X-Forwarded-For'),'proto':self.headers.get('X-Forwarded-Proto')}).encode()
  self.send_response(200); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(content))); self.end_headers(); self.wfile.write(content)
 def do_POST(self):
  remaining=int(self.headers.get('Content-Length','0'))
  while remaining:
   chunk=self.rfile.read(min(remaining,65536))
   if not chunk: break
   remaining-=len(chunk)
  self.do_GET()
ThreadingHTTPServer(('0.0.0.0',8080),Handler).serve_forever()
''')
        (cls.directory / "default.conf").write_text(renderer.render(
            **HOSTS, certificate_root="/test/certs", acme_root="/test/acme",
            web_upstream="upstream:8080", api_upstream="upstream:8080", media_upstream="upstream:8080"))
        cls.command("docker", "network", "create", cls.prefix)
        cls.command("docker", "run", "-d", "--name", cls.prefix + "-upstream", "--network", cls.prefix,
                    "--network-alias", "upstream", "--mount", f"type=bind,src={cls.directory},dst=/test,readonly",
                    "python:3.13-alpine", "python", "/test/stub.py")
        cls.command("docker", "run", "-d", "--name", cls.prefix + "-edge", "--network", cls.prefix,
                    "-p", "127.0.0.1::443", "-p", "127.0.0.1::80",
                    "--mount", f"type=bind,src={cls.directory},dst=/test,readonly",
                    "--mount", f"type=bind,src={cls.directory / 'default.conf'},dst=/etc/nginx/conf.d/default.conf,readonly",
                    cls.image)
        cls.port = int(cls.command("docker", "port", cls.prefix + "-edge", "443/tcp").rsplit(":", 1)[1])
        cls.http_port = int(cls.command("docker", "port", cls.prefix + "-edge", "80/tcp").rsplit(":", 1)[1])
        for _ in range(50):
            try:
                if cls.request("app", "/login")[0] == 200:
                    break
            except (OSError, http.client.HTTPException):
                pass
            time.sleep(0.1)
        else:
            raise RuntimeError("Disposable proxy did not become ready")
        cls.command("docker", "exec", cls.prefix + "-edge", "nginx", "-t")

    @classmethod
    def cleanup(cls):
        for name in [cls.prefix + "-edge", cls.prefix + "-upstream"]:
            subprocess.run(["docker", "rm", "-f", name], capture_output=True)
        subprocess.run(["docker", "network", "rm", cls.prefix], capture_output=True)
        shutil.rmtree(cls.directory, ignore_errors=True)

    @classmethod
    def request(cls, host, path, method="GET", body=None, headers=None):
        # Validate the rehearsal certificate, including its hostname, while connecting to loopback.
        context = ssl.create_default_context(cafile=str(cls.directory / "certs/cert.pem"))
        connection = http.client.HTTPSConnection("127.0.0.1", cls.port, context=context, timeout=10)
        def connect():
            connection.sock = context.wrap_socket(
                socket.create_connection(("127.0.0.1", cls.port), 10),
                server_hostname=host + ".dawes.test",
            )
        connection.connect = connect
        try:
            connection.request(method, path, body=body, headers={"Host": host + ".dawes.test", **(headers or {})})
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def test_public_routes_reach_only_supported_services(self):
        for host, path in [("app", "/login"), ("api", "/rest/v1/projects"),
                           ("api", "/storage/v1/object/sign/brand-assets/test"), ("media", "/health")]:
            with self.subTest(path=path):
                status, headers, _ = self.request(host, path)
                self.assertEqual(status, 200)
                self.assertEqual(headers["Strict-Transport-Security"], "max-age=31536000")
        for path in ["/", "/pg/", "/analytics/v1/", "/auth/v1/admin/users", "/auth/v1/signup",
                     "/storage/v1/s3", "/functions/v1/", "/rest/v1/../../auth/v1/admin/users",
                     "/auth/v1/%61dmin/users"]:
            with self.subTest(path=path):
                self.assertEqual(self.request("api", path)[0], 404)

    def test_forwarded_headers_cannot_be_spoofed(self):
        _, _, body = self.request("api", "/rest/v1/projects", headers={"X-Forwarded-For": "203.0.113.10", "X-Forwarded-Proto": "http"})
        result = json.loads(body)
        self.assertNotEqual(result["forwarded"], "203.0.113.10")
        self.assertEqual(result["proto"], "https")

    def test_auth_and_media_rates_return_429(self):
        for host, path in [("api", "/auth/v1/token"), ("media", "/covers/prepare")]:
            responses = [self.request(host, path, "POST", b"{}")[0] for _ in range(18)]
            self.assertIn(200, responses)
            self.assertIn(429, responses)

    def test_upload_envelope_and_oversized_requests(self):
        # Real bytes traverse the streaming path; a 50 MiB file plus multipart envelope fits.
        self.assertEqual(self.request("api", "/storage/v1/object/internal-assets/test", "POST",
                                      b"x" * (50 * 1024 * 1024 + 1024))[0], 200)
        for host, path, size in [("api", "/storage/v1/object/internal-assets/test", 51 * 1024 * 1024 + 1),
                                 ("media", "/covers/prepare", 50 * 1024 * 1024 + 1),
                                 ("app", "/api/invitations", 1024 * 1024 + 1)]:
            with self.subTest(host=host):
                self.assertEqual(self.request(host, path, "POST", headers={"Content-Length": str(size)})[0], 413)

    def test_realtime_websocket_upgrade(self):
        self.assertEqual(self.request("api", "/realtime/v1/websocket", headers={"Upgrade": "websocket", "Connection": "Upgrade"})[0], 101)

    def test_http_redirect_and_unknown_host(self):
        connection = http.client.HTTPConnection("127.0.0.1", self.http_port, timeout=10)
        connection.request("GET", "/login", headers={"Host": HOSTS["app_host"]})
        response = connection.getresponse()
        self.assertEqual(response.status, 308)
        self.assertEqual(response.getheader("Location"), "https://app.dawes.test/login")
        connection.close()
        with self.assertRaises(ssl.SSLError):
            self.request("unknown", "/")


if __name__ == "__main__":
    unittest.main()
