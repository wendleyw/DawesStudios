# Trusted media service

This small HTTP service regenerates client-visible artwork from source bytes. It verifies the Supabase session and protected agency role before reading source files, writes sanitized objects using a server-only service credential, and registers a SHA-256 attestation in the private backend schema. Browser clients cannot write to publication or delivery buckets directly.

## Run locally

Install dependencies with `npm ci --prefix apps/media`. Copy `.env.example` to ignored `.env.local`, fill the values from the isolated local Supabase project, and run `npm --prefix apps/media start`. Poppler's `pdfinfo` and `pdftoppm` commands must be available on `PATH`. The default address is `http://127.0.0.1:55430`. `APP_ORIGIN` names the canonical browser origin, `http://localhost:3003` by default; `MEDIA_ALLOWED_ORIGINS` adds any further origins this machine serves the same application from, comma separated, which is what lets a `next dev` on its own port prepare a publication. `local_stack.py` writes the local development origins for you.

Never put `SUPABASE_SERVICE_ROLE_KEY` in a browser environment variable. Both service and fixture credential files are ignored and should have file mode `0600`.

## API

- `GET /health` returns service readiness.
- `POST /publications/prepare` accepts JSON `{ "versionId": "<internal-version-uuid>" }` and returns `{ "assets": { "<internal-design-uuid>": "<project-uuid>/<random-uuid>.png" } }`. Pass the map as `p_assets` and a stable per-submit UUID as `p_idempotency_key` to the authenticated `publish_version` RPC. Retry a lost response with the same key; use a new key for an intentional revision. Structured designs without uploaded files need no asset map entry. Source paths are resolved from authorized database rows, never supplied as external URLs.
- `POST /deliveries/prepare?projectId=<project-uuid>` accepts a raw PNG, JPEG, WebP or PDF body, its exact `Content-Type`, and an optional URL-encoded `X-File-Name` display label. The project must be approved. It returns `{ "id", "storagePath", "mimeType", "fileSize" }` after persisting the trusted delivery record. Marking the project delivered is a separate idempotent agency action. New supplemental files after delivery are not supported.
- `POST /assets/discard` accepts `{ "paths": ["<prepared-publication-path>"] }`, at most 20 paths, and returns `{ "discarded": [], "retained": [] }`. It removes only the caller's unreferenced prepared assets. If publication succeeded but its response was lost, referenced files are retained. The database flags files before deletion and removes the attestation only after Storage deletion succeeds.

All POST routes require `Authorization: Bearer <Supabase-user-access-token>`. Only a configured browser origin receives CORS permission: origins are compared whole against the allowlist, never reflected back because they asked, and an origin that is not named is refused with 403 before the body is read. Authentication and agency-role checks also apply to non-browser requests.

## Byte handling and limits

Raster images are decoded, orientation is applied, and fresh sRGB PNG pixels are encoded with Sharp's default metadata removal. PNG/JPEG/WebP source formats are accepted; multi-frame images, SVG and corrupt files are rejected.

PDFs are parsed and rendered by Poppler into fresh page images at 144 DPI, then rebuilt with pdf-lib. Page dimensions are preserved, including page rotation. Original metadata, scripts, attachments, links, forms, hidden text and author fields are never copied into the new document. This makes the output a flattened visual PDF; it does not preserve searchable text, forms or vector editability. Visible content is preserved, so agency review must still catch any creator identity visibly drawn into the artwork.

Limits are 50 MiB per input/output, 40 megapixels per raster, 20 PDF pages, 16 megapixels per rendered PDF page and 100 megapixels across a document. Each Poppler child process has a 30-second timeout; the PDF loop has a 90-second deadline. Two jobs may run concurrently. Temporary files are private, randomly named and removed in `finally`. Failed preparation cleans up objects created during that request. Startup and hourly cleanup retry flagged deletions and remove up to 100 unreferenced preparations older than 24 hours. Published/delivery references are never selected. Cleanup failures produce a stable operator log message and retry on the next pass.

Video and ZIP files are not accepted by this trusted client-visible pipeline. No claim of sanitization is made for arbitrary source formats.

## Tests and image

- `npm --prefix apps/media test` runs seven behavior tests covering metadata stripping, invalid formats, pixel limits, PDF attachments/scripts and page preservation.
- `npm --prefix apps/media run test:integration` requires the running local service and provisioned fixture credentials; it exercises real Auth, worker, Storage and SQL-attestation boundaries, then removes its temporary objects and restores the source design.
- `docker build -t dawes-media:local apps/media` builds the production image with Poppler and production dependencies only. Inject environment variables at runtime, publish the chosen port, and keep Supabase service access within the deployment's trusted network.
- `MEDIA_TEST_URL=http://127.0.0.1:55431 npm --prefix apps/media run test:integration` runs the same real pipeline checks against an isolated Docker image mapped to test port 55431.

The service returns stable error messages without exposing upstream response bodies, tokens or internal document metadata.
