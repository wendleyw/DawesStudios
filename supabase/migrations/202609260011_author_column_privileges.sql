-- Designer identity stays out of the API. Row policies decide which versions, designs and internal
-- links a designer reads, but a readable row used to carry its author: after the agency reassigns a
-- design board, the new designer read the earlier designer's id in design_versions.created_by and
-- design_version_miro_links.updated_by, and legacy versions and designs exposed created_by the same
-- way. Nothing in the application reads these columns, so no role reads them through the API: the
-- table-wide SELECT becomes a SELECT on every other column. Security-definer functions (which write
-- and audit authorship) are unaffected, and Realtime drops columns its subscriber cannot select.
-- A `select *` on these tables is now refused; callers name their columns.

revoke select on public.design_versions, public.designs, public.design_version_miro_links from authenticated;

grant select (id, project_id, deliverable_id, board_id, version_number, notes, status, created_at, request_key)
  on public.design_versions to authenticated;
grant select (id, project_id, version_id, title, content, internal_asset_path, sort_order, created_at)
  on public.designs to authenticated;
grant select (version_id, project_id, board_id, widget_id, updated_at)
  on public.design_version_miro_links to authenticated;
