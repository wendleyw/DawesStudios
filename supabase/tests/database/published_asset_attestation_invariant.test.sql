begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(1);

-- Final whole-branch review, Critical 2 (regression guard added at the acceptance-evidence
-- session's request): a whole-table invariant rather than a per-write assertion. A per-write
-- test proves one write happened correctly; this proves the table a client actually reads from
-- is clean, over the full seeded dataset plus anything this run has added. It does not care how
-- a bypass was reached -- a filename convention, a missing check, a future refactor that
-- re-derives "was this sanitised?" instead of requiring the attestation row -- so the
-- "publication re-sanitises for images but elective for video" asymmetry cannot silently return
-- in some other form later.
--
-- Measured on the shared stack before this migration: of 22 published designs, 18 carry a file
-- and all 18 already had a `published-assets` attestation; the other 4 are structured content
-- with no file (`asset_path is null`) and are excluded. There is no partial case today, which is
-- what makes this a usable guard rather than a test that has to special-case known exceptions.
select is(
  (select count(*)::int from public.published_designs pd
    where pd.asset_path is not null
      and not exists (select 1 from private.sanitized_assets sa
                       where sa.storage_path = pd.asset_path
                         and sa.bucket_id = 'published-assets')),
  0,
  'every published design that carries a file has a published-assets sanitisation attestation'
);

select * from finish();
rollback;
