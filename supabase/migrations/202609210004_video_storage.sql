-- Video is a design, so only the two design buckets widen. `brand-assets` and `delivery-files`
-- keep their 50 MiB ceiling: a logo and a delivery file are not video surfaces, and widening a
-- bucket costs nothing to write but everything to narrow again once objects exist.
--
-- One gigabyte covers ten minutes of 1080p H.264 at roughly 13 Mbit/s. The ceiling's reason is
-- remux time and storage cost. It is deliberately NOT the image reason: nothing decodes a video
-- frame here, so browser memory does not bound it.
update storage.buckets
   set file_size_limit = 1073741824,
       allowed_mime_types = allowed_mime_types || array['video/mp4','video/webm']
 where id in ('internal-assets','published-assets');

-- The attestation table caps what may be registered, and it is a CHECK rather than a bucket
-- setting, so raising the bucket alone would let a gigabyte video upload successfully and then
-- fail its `register_sanitized_asset` insert. That is a split brain and the worst possible
-- shape: the bytes are already in the bucket and the failed insert does not roll them back.
--
-- Raising this does NOT widen delivery files. `sanitized_assets.bucket_id` covers
-- 'published-assets' and 'delivery-files', but `delivery-files` keeps its 50 MiB bucket limit,
-- which stays the binding constraint for that path. Briefing attachments carry their own
-- identical CHECK in 202609200004 and are deliberately untouched — that bucket is not widening.
alter table private.sanitized_assets drop constraint sanitized_assets_file_size_check;
alter table private.sanitized_assets add constraint sanitized_assets_file_size_check
  check(file_size between 1 and 1073741824);

-- `.raw` names the object a resumable upload lands on before the media service has stripped its
-- metadata. It exists for the duration of one sanitisation and is deleted once the clean object
-- is written. No signed-URL read path serves it; it is here so the path passes the opacity rule
-- while it exists.
create or replace function private.opaque_storage_path(path text) returns boolean language sql immutable set search_path='' as $$
 select path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|jpeg|webp|pdf|svg|zip|mp4|webm|raw)$'
$$;
