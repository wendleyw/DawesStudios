-- Retire Versions, Phase 2, Task 2: `202609270007_retire_versions_schema.sql` deleted the legacy
-- rows and left the `published-assets` bucket alone because objects still lived in it -- a
-- migration cannot delete Storage bytes, only Postgres rows. `supabase/scripts/
-- cleanup_versions_storage.py --apply` has since removed every byte the migration's own inventory
-- named in `private.retired_version_objects` (143 published-assets + 190 internal-assets objects)
-- and confirmed no unreferenced `internal-assets` orphan was left behind either. This migration
-- finishes the retirement: the bucket nothing publishes to any more, its storage policies (none
-- remain -- `published_storage_insert` went in `202609200008_trusted_media.sql` and
-- `published_storage_read` in `202609270007`; the drops below are only a defensive no-op if that
-- ever changes), and the private table that existed solely to hand the cleanup script its list.
--
-- Guard: abort rather than drop the bucket while any object still claims it, so a missed
-- `--apply` run fails loudly here instead of silently orphaning bytes no policy can reach again.
do $$
begin
  if exists(select 1 from storage.objects where bucket_id = 'published-assets') then
    raise exception 'published-assets still holds objects; run cleanup_versions_storage.py --apply first';
  end if;
end $$;

drop policy if exists published_storage_read on storage.objects;
drop policy if exists published_storage_insert on storage.objects;

-- The Storage extension refuses a bare `delete` against its own tables outside its API, the same
-- guard `trusted_media_and_catalog.test.sql` lifts for its own object-level test deletes. Every
-- byte in this bucket is already gone (the guard above proved it); this only removes the empty
-- bucket's catalog row.
set local storage.allow_delete_query = 'true';
delete from storage.buckets where id = 'published-assets';

drop table private.retired_version_objects;
