#!/usr/bin/env bash
# Orchestrates the local staging rehearsal described in deploy/staging/README.md: the official
# self-hosted Supabase Docker distribution (docker-compose.yml + docker-compose.s3.yml, MinIO
# retained as a historical S3 rehearsal), plus this repo's web/media images, under a distinct compose
# project name and a reserved 56000-56999 host port range.
#
# Subcommands run in this order for a full rehearsal:
#   fetch          sparse-clone supabase/supabase's docker/ dir at the pinned commit (once)
#   prepare        generate secrets, write .work/.env (0600), copy docker/ into .work/docker
#   up             pull images, start the staging Supabase stack, wait for health
#   migrate        supabase db push against the staging Postgres, then list recorded versions
#   app-build      build the staging web/media images (distinct :staging tags)
#   app-up         start the staging web/media containers
#   verify         header/health checks against web and media (production checklist step 4)
#   bootstrap      create+promote the first agency user; prove login, an agency-only REST read,
#                  and that public sign-up is refused
#   storage-test   TUS + standard upload through the S3/MinIO backend, SHA-256 compare, confirm
#                  the objects in MinIO, confirm an anonymous read is denied
#   provision-fixtures
#                  after supabase/seed.sql is applied with psql: fixture Auth passwords + Storage
#                  objects (brand/working assets), via scripts/provision_fixtures.py; checks the
#                  10 clients/25 projects canonical counts
#   status         docker compose ps for both projects
#   down           stop (not remove) both projects; prints the real teardown commands
#
# Every command is safe to re-run. `prepare` refuses to touch an existing .work/.env unless you
# pass `prepare --force` (which rotates every secret and wipes any local Postgres/MinIO data).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAGING_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$STAGING_DIR/../.." && pwd)"
UPSTREAM_DIR="$STAGING_DIR/.upstream"
UPSTREAM_DOCKER_DIR="$UPSTREAM_DIR/docker"
WORK_DIR="$STAGING_DIR/.work"
WORK_DOCKER_DIR="$WORK_DIR/docker"
ARTIFACT_DIR="$WORK_DIR/artifacts"
ENV_FILE="$WORK_DIR/.env"

# Pinned upstream commit (github.com/supabase/supabase). Re-pin deliberately: `fetch` never moves
# this on its own. Recorded here so `docker/versions.md` at this SHA is the single source of truth
# for image tags — see deploy/staging/README.md for the versions it lists.
PINNED_SHA="d51ed9f451b0bf870c86a3427cc321511dbe73ab"

PROJECT_SUPABASE="dawes-staging"
PROJECT_APP="dawes-staging-app"

log() { printf '>> %s\n' "$*" >&2; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

require_upstream() {
  [[ -d "$UPSTREAM_DOCKER_DIR" ]] || die "Upstream not fetched. Run: $0 fetch"
}

require_prepared() {
  [[ -f "$ENV_FILE" ]] || die "Not prepared. Run: $0 prepare"
}

load_env() {
  require_prepared
  # docker compose's own --env-file parser handles unquoted spaces/parens/globs fine (e.g.
  # STUDIO_DEFAULT_ORGANIZATION's "Dawes Studios (staging)"), but plain bash `source` does not —
  # it would glob-expand or word-split them. Wrap every value in double quotes first. This goes
  # through a real temp file rather than `source <(...)`: process substitution silently sources
  # zero variables under macOS's default /bin/bash (3.2) — confirmed empirically — while a real
  # file sources correctly on both 3.2 and modern bash.
  local quoted; quoted="$(mktemp "${WORK_DIR}/.env.quoted.XXXXXX")"
  chmod 600 "$quoted"
  sed -E 's/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/\1="\2"/' "$ENV_FILE" > "$quoted"
  set -a
  # shellcheck disable=SC1090
  source "$quoted"
  set +a
  rm -f "$quoted"
}

compose_supabase() {
  docker compose -p "$PROJECT_SUPABASE" --env-file "$ENV_FILE" \
    -f "$WORK_DOCKER_DIR/docker-compose.yml" \
    -f "$WORK_DOCKER_DIR/docker-compose.s3.yml" \
    -f "$STAGING_DIR/compose.supabase.override.yml" \
    "$@"
}

compose_app() {
  docker compose -p "$PROJECT_APP" --env-file "$ENV_FILE" \
    -f "$STAGING_DIR/compose.app.yml" \
    "$@"
}

# ---------------------------------------------------------------------------------------------
# fetch — sparse, shallow clone of supabase/supabase's docker/ directory at the pinned commit.
# ---------------------------------------------------------------------------------------------
cmd_fetch() {
  log "Fetching supabase/supabase docker/ at $PINNED_SHA into $UPSTREAM_DIR"
  rm -rf "$UPSTREAM_DIR"
  mkdir -p "$UPSTREAM_DIR"
  (
    cd "$UPSTREAM_DIR"
    git init -q
    git remote add origin https://github.com/supabase/supabase.git
    git fetch --depth 1 origin "$PINNED_SHA"
    git checkout -q FETCH_HEAD
    git sparse-checkout init --cone
    git sparse-checkout set docker
  )
  local head; head="$(cd "$UPSTREAM_DIR" && git rev-parse HEAD)"
  [[ "$head" == "$PINNED_SHA" ]] || die "Fetched HEAD ($head) does not match pinned SHA ($PINNED_SHA)"
  log "Fetched. See $UPSTREAM_DOCKER_DIR/versions.md for image tags at this commit."
}

# ---------------------------------------------------------------------------------------------
# prepare — generate secrets and an ignored working copy. Refuses to clobber an existing one.
# ---------------------------------------------------------------------------------------------
gen_hex() { openssl rand -hex "$1"; }
gen_b64() { openssl rand -base64 "$1"; }
b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

# Mirrors utils/generate-keys.sh's gen_token() from the fetched upstream, so these legacy HS256
# ANON_KEY/SERVICE_ROLE_KEY JWTs are produced the same way the official distribution's own script
# produces them.
jwt_sign() { # $1=json payload  $2=secret
  local header='{"alg":"HS256","typ":"JWT"}'
  local h p signing_input sig
  h="$(printf '%s' "$header" | b64url)"
  p="$(printf '%s' "$1" | b64url)"
  signing_input="${h}.${p}"
  sig="$(printf '%s' "$signing_input" | openssl dgst -binary -sha256 -hmac "$2" | b64url)"
  printf '%s.%s' "$signing_input" "$sig"
}

cmd_prepare() {
  require_upstream
  if [[ -f "$ENV_FILE" && "${1:-}" != "--force" ]]; then
    log "$ENV_FILE already exists — leaving it and $WORK_DOCKER_DIR as-is."
    log "Pass 'prepare --force' to regenerate (rotates every secret and wipes any local"
    log "Postgres/MinIO data under $WORK_DOCKER_DIR/volumes)."
    return 0
  fi
  if [[ "${1:-}" == "--force" ]]; then
    log "Force: wiping $WORK_DIR"
    rm -rf "$WORK_DIR"
  fi

  mkdir -p "$WORK_DIR" "$ARTIFACT_DIR"
  cp -R "$UPSTREAM_DOCKER_DIR" "$WORK_DOCKER_DIR"

  log "Generating secrets and staging .env"
  local jwt_secret postgres_password iat exp anon_key service_role_key
  jwt_secret="$(gen_b64 30)"
  postgres_password="$(gen_hex 16)"
  iat="$(date +%s)"
  exp="$((iat + 5 * 3600 * 24 * 365))"
  anon_key="$(jwt_sign "{\"role\":\"anon\",\"iss\":\"supabase\",\"iat\":${iat},\"exp\":${exp}}" "$jwt_secret")"
  service_role_key="$(jwt_sign "{\"role\":\"service_role\",\"iss\":\"supabase\",\"iat\":${iat},\"exp\":${exp}}" "$jwt_secret")"

  local staging_gateway_port=56010
  local staging_db_port=56011
  local staging_minio_api_port=56012
  local staging_minio_console_port=56013
  local web_port=3103
  local media_port=56014

  {
    echo "# Generated by scripts/stage.sh prepare on $(date -u +%FT%TZ). Mode 0600. Never commit."
    echo "# Secret values are never printed by stage.sh; read this file directly if you need one."
    echo
    echo "### Host ports (127.0.0.1 only; see compose.supabase.override.yml / compose.app.yml)"
    echo "STAGING_GATEWAY_PORT=${staging_gateway_port}"
    echo "STAGING_DB_PORT=${staging_db_port}"
    echo "STAGING_MINIO_API_PORT=${staging_minio_api_port}"
    echo "STAGING_MINIO_CONSOLE_PORT=${staging_minio_console_port}"
    echo "WEB_PORT=${web_port}"
    echo "MEDIA_PORT=${media_port}"
    echo
    echo "### Upstream secrets (docker/utils/generate-keys.sh equivalents)"
    echo "POSTGRES_PASSWORD=${postgres_password}"
    echo "JWT_SECRET=${jwt_secret}"
    echo "ANON_KEY=${anon_key}"
    echo "SERVICE_ROLE_KEY=${service_role_key}"
    echo "SECRET_KEY_BASE=$(gen_b64 48)"
    echo "REALTIME_DB_ENC_KEY=$(gen_hex 8)"
    echo "VAULT_ENC_KEY=$(gen_hex 16)"
    echo "PG_META_CRYPTO_KEY=$(gen_b64 24)"
    echo "LOGFLARE_PUBLIC_ACCESS_TOKEN=$(gen_b64 24)"
    echo "LOGFLARE_PRIVATE_ACCESS_TOKEN=$(gen_b64 24)"
    echo "S3_PROTOCOL_ACCESS_KEY_ID=$(gen_hex 16)"
    echo "S3_PROTOCOL_ACCESS_KEY_SECRET=$(gen_hex 32)"
    echo "DASHBOARD_USERNAME=dawes-staging"
    echo "DASHBOARD_PASSWORD=$(gen_hex 16)"
    echo "POOLER_TENANT_ID=dawes-staging-$(gen_hex 4)"
    echo "POOLER_DEFAULT_POOL_SIZE=20"
    echo "POOLER_MAX_CLIENT_CONN=100"
    echo "POOLER_DB_POOL_SIZE=5"
    echo "POOLER_PROXY_PORT_TRANSACTION=6543"
    echo "POSTGRES_PORT=5432"
    echo "POSTGRES_HOST=db"
    echo "POSTGRES_DB=postgres"
    echo
    echo "### MinIO (historical S3 rehearsal; production now uses filesystem Storage)"
    echo "MINIO_ROOT_USER=dawes-staging-minio"
    echo "MINIO_ROOT_PASSWORD=$(gen_hex 16)"
    echo "GLOBAL_S3_BUCKET=dawes-staging-storage"
    echo "REGION=auto"
    echo "STORAGE_TENANT_ID=dawes-staging"
    echo
    echo "### URLs"
    echo "SUPABASE_PUBLIC_URL=http://localhost:${staging_gateway_port}"
    echo "API_EXTERNAL_URL=http://localhost:${staging_gateway_port}/auth/v1"
    echo "SITE_URL=http://localhost:${web_port}"
    echo "ADDITIONAL_REDIRECT_URLS=http://localhost:${web_port}/auth/recovery,http://localhost:${web_port}/auth/invite**"
    echo
    echo "### Auth (docs/operations/production.md's local-config.toml -> production table)"
    echo "JWT_EXPIRY=900"
    echo "DISABLE_SIGNUP=true"
    echo "ENABLE_EMAIL_SIGNUP=true"
    echo "ENABLE_EMAIL_AUTOCONFIRM=false"
    echo "ENABLE_ANONYMOUS_USERS=false"
    echo "ENABLE_PHONE_SIGNUP=false"
    echo "ENABLE_PHONE_AUTOCONFIRM=false"
    echo "SMTP_ADMIN_EMAIL=admin@dawes-staging.local"
    echo "SMTP_HOST=supabase-mail"
    echo "SMTP_PORT=2500"
    echo "SMTP_USER=fake_mail_user"
    echo "SMTP_PASS=fake_mail_password"
    echo "SMTP_SENDER_NAME=dawes-staging"
    echo "MAILER_URLPATHS_CONFIRMATION=/auth/v1/verify"
    echo "MAILER_URLPATHS_INVITE=/auth/v1/verify"
    echo "MAILER_URLPATHS_RECOVERY=/auth/v1/verify"
    echo "MAILER_URLPATHS_EMAIL_CHANGE=/auth/v1/verify"
    echo
    echo "### API / Studio"
    echo "PGRST_DB_SCHEMAS=public,graphql_public"
    echo "PGRST_DB_MAX_ROWS=1000"
    echo "PGRST_DB_EXTRA_SEARCH_PATH=public"
    echo "STUDIO_DEFAULT_ORGANIZATION=Dawes Studios (staging)"
    echo "STUDIO_DEFAULT_PROJECT=dawes-staging"
    echo "OPENAI_API_KEY="
    echo "FUNCTIONS_VERIFY_JWT=false"
    echo "IMGPROXY_AUTO_WEBP=true"
    echo "API_GW_HTTP_PORT=${staging_gateway_port}"
    echo "KONG_HTTP_PORT=${staging_gateway_port}"
    echo "ANON_KEY_ASYMMETRIC="
    echo "SERVICE_ROLE_KEY_ASYMMETRIC="
    echo "SUPABASE_PUBLISHABLE_KEY="
    echo "SUPABASE_SECRET_KEY="
    echo "JWT_KEYS="
    echo "JWT_JWKS="
    echo
    echo "### Storage (production.md targets; see compose.supabase.override.yml for how these two"
    echo "### actually reach the storage service — upstream hardcodes/omits both, see README)"
    echo "FILE_SIZE_LIMIT=1073741824"
    echo "TUS_ALLOW_S3_TAGS=false"
    echo
    echo "### App containers (compose.app.yml) — build-time NEXT_PUBLIC_* and runtime server vars"
    echo "NEXT_PUBLIC_SUPABASE_URL=http://localhost:${staging_gateway_port}"
    echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=${anon_key}"
    echo "NEXT_PUBLIC_MEDIA_URL=http://localhost:${media_port}"
    echo "SUPABASE_INTERNAL_URL=http://host.docker.internal:${staging_gateway_port}"
    echo "SUPABASE_SERVICE_ROLE_KEY=${service_role_key}"
    echo "APP_ORIGIN=http://localhost:${web_port}"
    echo "MEDIA_ALLOWED_ORIGINS="
  } > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  log "Wrote $ENV_FILE (mode 0600) and working copy at $WORK_DOCKER_DIR"
}

# ---------------------------------------------------------------------------------------------
# up — start the staging Supabase stack and wait for health.
# ---------------------------------------------------------------------------------------------
cmd_up() {
  load_env
  log "Pulling images (first run only; see docker/versions.md for tags)"
  compose_supabase pull
  log "Starting staging Supabase stack (project: $PROJECT_SUPABASE)"
  compose_supabase up -d --wait --wait-timeout 300
  compose_supabase ps
}

# ---------------------------------------------------------------------------------------------
# migrate — apply supabase/migrations/ with the Supabase CLI against the direct staging DB port.
# ---------------------------------------------------------------------------------------------
cmd_migrate() {
  load_env
  # Upstream's `db` service has no TLS configured out of the box (no cert is provisioned by
  # docker-compose.yml); the Supabase CLI (v2.98.2) otherwise attempts TLS first and the server
  # refuses it: "tls error (server refused TLS connection)", reproduced against this exact stack.
  # `?sslmode=disable` on --db-url alone did NOT fix it (same error) — the CLI's pgx driver reads
  # the libpq-standard PGSSLMODE environment variable instead, which does. Plaintext over a
  # 127.0.0.1-only published port for a local rehearsal is the accepted tradeoff here; real
  # production Postgres access must still require TLS.
  local url="postgresql://postgres:${POSTGRES_PASSWORD}@127.0.0.1:${STAGING_DB_PORT}/postgres?sslmode=disable"
  log "PGSSLMODE=disable supabase db push --db-url <staging Postgres, password redacted> --workdir $REPO_ROOT"
  PGSSLMODE=disable supabase db push --db-url "$url" --include-all --yes --workdir "$REPO_ROOT"
  log "Recorded migration versions (supabase_migrations.schema_migrations):"
  docker exec dawes-staging-db psql -U postgres -d postgres -Atc \
    "select version from supabase_migrations.schema_migrations order by version;"
}

# ---------------------------------------------------------------------------------------------
# app-build / app-up — staging web/media images and containers.
# ---------------------------------------------------------------------------------------------
cmd_app_build() {
  load_env
  compose_app build
}

cmd_app_up() {
  load_env
  compose_app up -d --wait --wait-timeout 120
  compose_app ps
}

# ---------------------------------------------------------------------------------------------
# verify — production checklist step 4: headers and health.
# ---------------------------------------------------------------------------------------------
cmd_verify() {
  load_env
  mkdir -p "$ARTIFACT_DIR"
  local web="http://localhost:${WEB_PORT}"
  local media="http://localhost:${MEDIA_PORT}"
  local gw_http="http://localhost:${STAGING_GATEWAY_PORT}"
  local gw_ws="ws://localhost:${STAGING_GATEWAY_PORT}"
  local headers_file="$ARTIFACT_DIR/login-headers.txt"

  log "curl -sS -D - -o /dev/null $web/login"
  local code
  code="$(curl -sS -D "$headers_file" -o /dev/null -w '%{http_code}' "$web/login")"
  [[ "$code" == "200" ]] && echo "PASS GET /login -> $code" || echo "FAIL GET /login -> $code"

  grep -qi '^content-security-policy:' "$headers_file" \
    && echo "PASS Content-Security-Policy header present" \
    || echo "FAIL Content-Security-Policy header missing"
  grep -qi "content-security-policy:.*${gw_http}" "$headers_file" \
    && echo "PASS CSP includes staging http origin ($gw_http)" \
    || echo "FAIL CSP missing staging http origin ($gw_http)"
  grep -qi "content-security-policy:.*${gw_ws}" "$headers_file" \
    && echo "PASS CSP includes staging ws origin ($gw_ws)" \
    || echo "FAIL CSP missing staging ws origin ($gw_ws)"
  grep -qi '^strict-transport-security:' "$headers_file" \
    && echo "PASS Strict-Transport-Security header present" \
    || echo "FAIL Strict-Transport-Security header missing"
  grep -qi '^x-powered-by:' "$headers_file" \
    && echo "FAIL X-Powered-By header present" \
    || echo "PASS X-Powered-By header absent"

  log "curl -sS $media/health"
  local media_body="$ARTIFACT_DIR/media-health.json"
  local media_code
  media_code="$(curl -sS -o "$media_body" -w '%{http_code}' "$media/health")"
  [[ "$media_code" == "200" ]] \
    && echo "PASS GET media /health -> 200 ($(cat "$media_body"))" \
    || echo "FAIL GET media /health -> $media_code ($(cat "$media_body"))"

  echo "Full response headers saved at $headers_file"
}

# ---------------------------------------------------------------------------------------------
# bootstrap — first agency account the way production would create one.
# ---------------------------------------------------------------------------------------------
cmd_bootstrap() {
  load_env
  command -v jq >/dev/null || die "jq is required"
  local gw="http://localhost:${STAGING_GATEWAY_PORT}"
  local agency_email="agency-bootstrap@dawes-staging.local"
  local agency_password client_email client_password
  agency_password="$(openssl rand -base64 24)"
  client_email="client-check@dawes-staging.local"
  client_password="$(openssl rand -base64 24)"

  log "POST $gw/auth/v1/admin/users (agency candidate, email confirmed)"
  local agency_resp agency_id
  agency_resp="$(curl -sS -X POST "$gw/auth/v1/admin/users" \
    -H "apikey: ${SERVICE_ROLE_KEY}" -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${agency_email}\",\"password\":\"${agency_password}\",\"email_confirm\":true,\"user_metadata\":{\"display_name\":\"Staging Agency\"}}")"
  agency_id="$(echo "$agency_resp" | jq -r '.id // empty')"
  [[ -n "$agency_id" ]] && echo "PASS admin create (agency candidate) -> id=${agency_id}" \
    || { echo "FAIL admin create (agency candidate): $agency_resp"; return 1; }

  log "POST $gw/auth/v1/admin/users (second user, stays role=client, proves agency sees more than self)"
  local client_resp client_id
  client_resp="$(curl -sS -X POST "$gw/auth/v1/admin/users" \
    -H "apikey: ${SERVICE_ROLE_KEY}" -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${client_email}\",\"password\":\"${client_password}\",\"email_confirm\":true,\"user_metadata\":{\"display_name\":\"Staging Client Check\"}}")"
  client_id="$(echo "$client_resp" | jq -r '.id // empty')"
  [[ -n "$client_id" ]] && echo "PASS admin create (second user) -> id=${client_id}" \
    || echo "FAIL admin create (second user): $client_resp"

  log "SQL as postgres: update public.profiles set role='agency' where id='${agency_id}'"
  docker exec dawes-staging-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
    "update public.profiles set role='agency' where id='${agency_id}';"
  echo "PASS SQL promotion executed"

  log "POST $gw/auth/v1/token?grant_type=password (agency)"
  local token_resp access_token
  token_resp="$(curl -sS -X POST "$gw/auth/v1/token?grant_type=password" \
    -H "apikey: ${ANON_KEY}" -H "Content-Type: application/json" \
    -d "{\"email\":\"${agency_email}\",\"password\":\"${agency_password}\"}")"
  access_token="$(echo "$token_resp" | jq -r '.access_token // empty')"
  [[ -n "$access_token" ]] && echo "PASS password grant issued an access token" \
    || { echo "FAIL password grant: $token_resp"; return 1; }

  log "GET $gw/rest/v1/profiles?select=id,role (agency-only full read — profiles_read policy)"
  local rest_out rest_code rest_body row_count
  rest_out="$(curl -sS -w '\n%{http_code}' "$gw/rest/v1/profiles?select=id,role" \
    -H "apikey: ${ANON_KEY}" -H "Authorization: Bearer ${access_token}")"
  rest_code="$(echo "$rest_out" | tail -n1)"
  rest_body="$(echo "$rest_out" | sed '$d')"
  row_count="$(echo "$rest_body" | jq 'length' 2>/dev/null || echo 0)"
  if [[ "$rest_code" == "200" && "$row_count" -ge 2 ]]; then
    echo "PASS agency REST read -> 200, ${row_count} profiles visible (both users)"
  else
    echo "FAIL agency REST read -> status ${rest_code}, ${row_count} rows: ${rest_body}"
  fi

  log "POST $gw/auth/v1/signup (must be refused: DISABLE_SIGNUP=true)"
  local signup_code
  signup_code="$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$gw/auth/v1/signup" \
    -H "apikey: ${ANON_KEY}" -H "Content-Type: application/json" \
    -d "{\"email\":\"should-be-refused@dawes-staging.local\",\"password\":\"$(openssl rand -base64 24)\"}")"
  if [[ "$signup_code" != "200" && "$signup_code" != "201" ]]; then
    echo "PASS public sign-up refused -> status ${signup_code}"
  else
    echo "FAIL public sign-up succeeded -> status ${signup_code}"
  fi
}

# ---------------------------------------------------------------------------------------------
# storage-test — TUS + standard upload against the S3/MinIO backend.
# ---------------------------------------------------------------------------------------------
tus_meta_b64() { printf '%s' "$1" | openssl base64 -A; }

cmd_storage_test() {
  load_env
  command -v jq >/dev/null || die "jq is required"
  mkdir -p "$ARTIFACT_DIR"
  local gw="http://localhost:${STAGING_GATEWAY_PORT}"
  local bucket="internal-assets" # widened to 1 GiB + video mime types by the migrations

  local big_dir big_name big_path big_bytes=$((55 * 1024 * 1024))
  big_dir="$(uuidgen | tr '[:upper:]' '[:lower:]')"
  big_name="$(uuidgen | tr '[:upper:]' '[:lower:]').mp4"
  big_path="${big_dir}/${big_name}"
  local big_src="$ARTIFACT_DIR/big-src.bin"
  local big_dl="$ARTIFACT_DIR/big-downloaded.bin"
  log "Generating ${big_bytes} byte test object -> $big_src"
  head -c "$big_bytes" /dev/urandom > "$big_src"

  local small_dir small_name small_path
  small_dir="$(uuidgen | tr '[:upper:]' '[:lower:]')"
  small_name="$(uuidgen | tr '[:upper:]' '[:lower:]').png"
  small_path="${small_dir}/${small_name}"
  local small_src="$ARTIFACT_DIR/small-src.png"
  local small_dl="$ARTIFACT_DIR/small-downloaded.png"
  # Minimal valid 1x1 PNG.
  printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\nIDATx\x9cc\xf8\xcf\xc0\x00\x00\x03\x01\x01\x00\x18\xdd\x8d\xb0\x00\x00\x00\x00IEND\xaeB`\x82' > "$small_src"

  log "TUS: POST $gw/storage/v1/upload/resumable ($bucket/$big_path, $big_bytes bytes)"
  local metadata post_headers location upload_url
  metadata="bucketName $(tus_meta_b64 "$bucket"),objectName $(tus_meta_b64 "$big_path"),contentType $(tus_meta_b64 "video/mp4"),cacheControl $(tus_meta_b64 "3600")"
  post_headers="$(curl -sS -D - -o /dev/null -X POST "$gw/storage/v1/upload/resumable" \
    -H "Tus-Resumable: 1.0.0" -H "Upload-Length: ${big_bytes}" -H "Upload-Metadata: ${metadata}" \
    -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" -H "apikey: ${SERVICE_ROLE_KEY}")"
  location="$(echo "$post_headers" | grep -i '^location:' | awk '{print $2}' | tr -d '\r')"
  [[ -n "$location" ]] || { echo "FAIL TUS create — no Location header. Response headers:"; echo "$post_headers"; return 1; }
  case "$location" in http*) upload_url="$location" ;; *) upload_url="${gw}${location}" ;; esac
  echo "PASS TUS session created -> $upload_url"

  log "TUS: PATCH $upload_url (single chunk, whole file)"
  local patch_headers
  patch_headers="$(curl -sS -D - -o /dev/null -X PATCH "$upload_url" \
    -H "Tus-Resumable: 1.0.0" -H "Upload-Offset: 0" -H "Content-Type: application/offset+octet-stream" \
    -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" -H "apikey: ${SERVICE_ROLE_KEY}" \
    --data-binary "@${big_src}")"
  echo "$patch_headers" | grep -qi '^HTTP/[0-9.]* 204' \
    && echo "PASS TUS upload completed (204)" \
    || { echo "FAIL TUS upload — response headers:"; echo "$patch_headers"; return 1; }

  log "Standard upload: POST $gw/storage/v1/object/$bucket/$small_path"
  local std_code
  std_code="$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$gw/storage/v1/object/${bucket}/${small_path}" \
    -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" -H "apikey: ${SERVICE_ROLE_KEY}" \
    -H "Content-Type: image/png" --data-binary "@${small_src}")"
  [[ "$std_code" == "200" ]] && echo "PASS standard upload -> 200" || { echo "FAIL standard upload -> ${std_code}"; return 1; }

  log "Downloading both objects with the service role and comparing SHA-256"
  curl -sS -o "$big_dl" "$gw/storage/v1/object/${bucket}/${big_path}" \
    -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" -H "apikey: ${SERVICE_ROLE_KEY}"
  curl -sS -o "$small_dl" "$gw/storage/v1/object/${bucket}/${small_path}" \
    -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" -H "apikey: ${SERVICE_ROLE_KEY}"
  local big_sha_src big_sha_dl small_sha_src small_sha_dl
  big_sha_src="$(shasum -a 256 "$big_src" | awk '{print $1}')"
  big_sha_dl="$(shasum -a 256 "$big_dl" | awk '{print $1}')"
  small_sha_src="$(shasum -a 256 "$small_src" | awk '{print $1}')"
  small_sha_dl="$(shasum -a 256 "$small_dl" | awk '{print $1}')"
  [[ "$big_sha_src" == "$big_sha_dl" ]] && echo "PASS big object SHA-256 matches (${big_sha_src})" \
    || echo "FAIL big object SHA-256 mismatch (src=${big_sha_src} dl=${big_sha_dl})"
  [[ "$small_sha_src" == "$small_sha_dl" ]] && echo "PASS small object SHA-256 matches (${small_sha_src})" \
    || echo "FAIL small object SHA-256 mismatch (src=${small_sha_src} dl=${small_sha_dl})"

  log "Confirming both objects exist in MinIO (mc ls via a throwaway client on the staging network)"
  local net
  net="$(docker network ls --filter "label=com.docker.compose.project=${PROJECT_SUPABASE}" --format '{{.Name}}' | head -n1)"
  [[ -n "$net" ]] || die "Could not find the $PROJECT_SUPABASE compose network"
  local mc_out
  # --entrypoint sh: this image's default entrypoint is already `mc`, so an unoverridden `sh -c
  # "..."` is parsed as arguments to `mc` itself ("`sh` is not a recognized command") rather than
  # as a shell invocation — reproduced against this exact image.
  mc_out="$(docker run --rm --network "$net" --entrypoint sh cgr.dev/chainguard/minio-client:latest-dev -c \
    "mc alias set staging http://minio:9000 '${MINIO_ROOT_USER}' '${MINIO_ROOT_PASSWORD}' >/dev/null && mc ls --recursive staging/${GLOBAL_S3_BUCKET}")"
  echo "$mc_out" | grep -q "$big_name" && echo "PASS big object present in MinIO" || echo "FAIL big object not found in MinIO listing"
  echo "$mc_out" | grep -q "$small_name" && echo "PASS small object present in MinIO" || echo "FAIL small object not found in MinIO listing"
  echo "This checks the historical MinIO/S3 rehearsal only. Production now uses filesystem Storage; its persistence and restore checks remain a separate release gate."

  log "Confirming an anonymous request cannot read the objects"
  local anon_code
  anon_code="$(curl -sS -o /dev/null -w '%{http_code}' "$gw/storage/v1/object/${bucket}/${big_path}" \
    -H "apikey: ${ANON_KEY}" -H "Authorization: Bearer ${ANON_KEY}")"
  if [[ "$anon_code" != "200" ]]; then
    echo "PASS anonymous read denied -> status ${anon_code}"
  else
    echo "FAIL anonymous read succeeded -> status ${anon_code}"
  fi
}

# ---------------------------------------------------------------------------------------------
# provision-fixtures — fixture Auth passwords + Storage objects for the canonical dataset
# (supabase/seed.sql, applied separately with psql) via a thin wrapper that imports the reusable
# helpers in supabase/scripts read-only. See scripts/provision_fixtures.py for why it does not
# call supabase/scripts/provision_local_auth.py directly (that script only ever targets the
# CLI-tracked local stack).
# ---------------------------------------------------------------------------------------------
cmd_provision_fixtures() {
  load_env
  command -v python3 >/dev/null || die "python3 is required"
  python3 "$SCRIPT_DIR/provision_fixtures.py"
}

# ---------------------------------------------------------------------------------------------
# status / down
# ---------------------------------------------------------------------------------------------
cmd_status() {
  load_env
  echo "--- $PROJECT_SUPABASE ---"
  compose_supabase ps
  echo "--- $PROJECT_APP ---"
  compose_app ps
}

cmd_down() {
  load_env
  log "Stopping $PROJECT_APP (containers retained, not removed)"
  compose_app stop
  log "Stopping $PROJECT_SUPABASE (containers and volumes retained, not removed)"
  compose_supabase stop
  cat <<EOF

Stopped, not removed. Resume with:
  $0 up && $0 app-up

Full teardown (irreversible — destroys the Postgres data dir and MinIO volume):
  docker compose -p ${PROJECT_APP} --env-file ${ENV_FILE} -f ${STAGING_DIR}/compose.app.yml down -v
  docker compose -p ${PROJECT_SUPABASE} --env-file ${ENV_FILE} -f ${WORK_DOCKER_DIR}/docker-compose.yml -f ${WORK_DOCKER_DIR}/docker-compose.s3.yml -f ${STAGING_DIR}/compose.supabase.override.yml down -v
  rm -rf ${WORK_DIR}   # only after both 'down -v' above; deletes generated secrets too
EOF
}

usage() {
  cat <<EOF
Usage: $0 <command>

  fetch          sparse-clone the pinned upstream docker/ directory (see PINNED_SHA in this file)
  prepare [--force]
                 generate secrets + working copy (.work/.env, .work/docker) — refuses to clobber
  up             pull images, start the staging Supabase stack, wait for health
  migrate        supabase db push against the staging Postgres; list recorded migration versions
  app-build      build dawes-studios-web:staging and dawes-studios-media:staging
  app-up         start the staging web/media containers
  verify         header/health checks (production checklist step 4)
  bootstrap      create + promote the first agency user; prove login, agency-only REST, no sign-up
  storage-test   TUS + standard upload through MinIO; SHA-256 compare; anon read denied
  provision-fixtures
                 fixture Auth passwords + Storage objects for supabase/seed.sql's canonical
                 dataset (apply the seed with psql first); checks the 10 clients/25 projects counts
  status         docker compose ps for both projects
  down           stop (not remove) both projects; prints teardown commands
EOF
}

main() {
  local cmd="${1:-}"
  [[ $# -gt 0 ]] && shift
  case "$cmd" in
    fetch) cmd_fetch "$@" ;;
    prepare) cmd_prepare "$@" ;;
    up) cmd_up "$@" ;;
    migrate) cmd_migrate "$@" ;;
    app-build) cmd_app_build "$@" ;;
    app-up) cmd_app_up "$@" ;;
    verify) cmd_verify "$@" ;;
    bootstrap) cmd_bootstrap "$@" ;;
    storage-test) cmd_storage_test "$@" ;;
    provision-fixtures) cmd_provision_fixtures "$@" ;;
    status) cmd_status "$@" ;;
    down) cmd_down "$@" ;;
    *) usage; exit 1 ;;
  esac
}

main "$@"
