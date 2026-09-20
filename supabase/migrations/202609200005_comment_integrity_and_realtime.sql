-- SQL CHECK expressions must reject partial coordinates rather than evaluate to NULL.
alter table public.internal_comments drop constraint internal_comments_check1;
alter table public.internal_comments add constraint internal_comment_pin_pair check (
 (pin_x is null and pin_y is null) or
 (design_id is not null and pin_x is not null and pin_y is not null and pin_x between 0 and 1 and pin_y between 0 and 1)
);
alter table public.client_comments drop constraint client_comments_check1;
alter table public.client_comments add constraint client_comment_pin_pair check (
 (pin_x is null and pin_y is null) or
 (design_id is not null and pin_x is not null and pin_y is not null and pin_x between 0 and 1 and pin_y between 0 and 1)
);
-- Realtime rechecks SELECT RLS for each subscriber. These streams have no permitted client DELETE.
alter publication supabase_realtime add table public.projects,public.internal_comments,public.client_comments,public.notifications,public.publication_reviews,public.published_versions;
