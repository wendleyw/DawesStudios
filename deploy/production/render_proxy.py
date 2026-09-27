"""Render the public nginx edge configuration; never installs or reloads it."""
import argparse
from pathlib import Path
import re

DIRECTORY = Path(__file__).resolve().parent
HOST = re.compile(r"(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$")
UPSTREAM = re.compile(r"(?:127\.0\.0\.1|[a-zA-Z0-9][a-zA-Z0-9.-]*):([0-9]{1,5})$")
SAFE_PATH = re.compile(r"/[a-zA-Z0-9_./-]+$")


def render(*, app_host, api_host, media_host, certificate_root="/etc/letsencrypt/live",
           acme_root="/var/www/acme", web_upstream="127.0.0.1:3003",
           api_upstream="127.0.0.1:8000", media_upstream="127.0.0.1:55430",
           http_port=80, https_port=443):
    hosts = [app_host, api_host, media_host]
    if len(set(hosts)) != 3 or any(not HOST.fullmatch(host) for host in hosts):
        raise ValueError("Three distinct lowercase DNS hostnames are required.")
    for path in [certificate_root, acme_root]:
        if not SAFE_PATH.fullmatch(path) or ".." in Path(path).parts:
            raise ValueError("Certificate and ACME roots must be safe absolute paths.")
    for upstream in [web_upstream, api_upstream, media_upstream]:
        match = UPSTREAM.fullmatch(upstream)
        if not match or not 1 <= int(match[1]) <= 65535:
            raise ValueError("Upstreams must be a trusted hostname or loopback address and port.")
    if any(not 1 <= port <= 65535 for port in [http_port, https_port]) or http_port == https_port:
        raise ValueError("Distinct valid HTTP and HTTPS ports are required.")
    values = dict(APP_HOST=app_host, API_HOST=api_host, MEDIA_HOST=media_host,
                  ACME_ROOT=acme_root, HTTP_PORT=str(http_port), HTTPS_PORT=str(https_port),
                  HTTPS_SUFFIX="" if https_port == 443 else ":" + str(https_port),
                  WEB_UPSTREAM=web_upstream, API_UPSTREAM=api_upstream, MEDIA_UPSTREAM=media_upstream)
    for name, host in zip(["APP", "API", "MEDIA"], hosts):
        values[name + "_TLS"] = f'''ssl_certificate {certificate_root}/{host}/fullchain.pem;
    ssl_certificate_key {certificate_root}/{host}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    server_tokens off;
    limit_req_status 429;
    limit_conn_status 429;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options nosniff always;
    access_log /dev/stdout dawes;
    # nginx error logs can include signed query strings; retain critical process failures only.
    error_log /dev/stderr crit;
    client_body_timeout 30s;
    client_header_timeout 10s;
    send_timeout 60s;
    proxy_connect_timeout 5s;
    proxy_read_timeout 120s;
    proxy_send_timeout 120s;
    proxy_next_upstream off;'''
    values["PROXY_HEADERS"] = f'''proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Port {https_port};
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Real-IP $remote_addr;'''
    result = (DIRECTORY / "nginx.conf.template").read_text()
    for name, value in values.items():
        result = result.replace("@@" + name + "@@", value)
    if "@@" in result:
        raise ValueError("Unresolved proxy template variable.")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ["app-host", "api-host", "media-host"]:
        parser.add_argument("--" + name, required=True)
    parser.add_argument("--certificate-root", default="/etc/letsencrypt/live")
    parser.add_argument("--acme-root", default="/var/www/acme")
    for name, default in [("web", "127.0.0.1:3003"), ("api", "127.0.0.1:8000"), ("media", "127.0.0.1:55430")]:
        parser.add_argument("--" + name + "-upstream", default=default)
    parser.add_argument("--http-port", type=int, default=80)
    parser.add_argument("--https-port", type=int, default=443)
    args = vars(parser.parse_args())
    try:
        print(render(**args), end="")
    except ValueError as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
