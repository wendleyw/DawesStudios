-- Creative boards now live in Miro. Align direct Storage uploads with the current Files UI.
-- Bucket settings govern new uploads; existing objects and their references remain untouched.
update storage.buckets
   set file_size_limit = 52428800,
       allowed_mime_types = array['image/png','image/jpeg','image/webp','application/pdf']
 where id = 'internal-assets';

-- Keep historical sanitized-asset attestations and opaque paths readable. Their wider legacy
-- constraints grant no upload permission and do not override the bucket's enforced limit.
-- This is a per-file ceiling, not an aggregate workspace or installation storage quota.
