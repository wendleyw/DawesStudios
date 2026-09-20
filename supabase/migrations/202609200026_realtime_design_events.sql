-- The project canvas is built from deliverables, versions and designs, but only comments,
-- publications and reviews were published for realtime. An agency watching a project therefore saw
-- a designer's new comment arrive while the version or design that comment refers to stayed
-- invisible until a manual reload.
--
-- Row level security still decides delivery: versions_read and designs_read both require
-- private.can_produce, so these events reach the agency and the assigned designer only — a client
-- never receives internal work in progress. The publication remains insert/update only, as set in
-- 202609200021, because a delete event carries no row to authorise.
alter publication supabase_realtime add table public.design_versions, public.designs;
