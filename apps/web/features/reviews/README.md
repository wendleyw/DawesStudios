# Reviews

The page uses the shared floating client navigation/profile above a white title/action card on
the workspace grid. Review filters sit inside the title card; the existing scoped review cards and
open actions remain below. The same layout adapts to desktop and mobile without duplicating client
navigation in the sidebar.

`reviews-page.tsx` lists the design versions currently in review: a designer's own in-progress
versions, or (for an agency/client session) the published versions awaiting client review, plus,
for an agency session, the versions a designer has submitted for internal studio review.

`review-data.ts` owns the feature's Supabase access, as
[the data-access contract](../../../../docs/architecture/data-access.md) requires. `useReviews` is
the page's single read hook, relocated verbatim from the page's inline `useQuery` during the
small-features migration (task 15) — same tables, same column selections, same filters and
ordering, same `refetchInterval`. The feature has no writes, so it has no accompanying
`<feature>-data.test.ts`: the contract's unit-testing requirement is for extracted write functions
and for reads that cannot be hooks, and this feature's one read is a proper hook.
