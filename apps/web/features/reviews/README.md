# Reviews

The page uses the shared floating client navigation/profile above a white title/action card on
the plain page background. Review filters sit inside the title card; below it, each version is one
line in a single bordered list: title, deliverable and version, the review note (full text in its
tooltip), a status badge and the date. The status column has a fixed width so columns align; below
1000 px the note and date drop, and below 720 px the deliverable moves under the title. Version
statuses map onto the shared badge tones in `reviews-page.tsx`. The same layout adapts to desktop and mobile without duplicating client
navigation in the sidebar.

`reviews-page.tsx` lists the design versions currently in review: a designer's own in-progress
versions, or (for an agency/client session) the published versions awaiting client review, plus,
for an agency session, the versions a designer has submitted for internal studio review.
`inReviewTab` decides which tab shows a row. A client's **Waiting for you** holds only versions
still waiting on their decision; a version they sent back is waiting on the studio and appears under
**With the studio**, and an approved one under **Approved**.

`review-data.ts` owns the feature's Supabase access, as
[the data-access contract](../../../../docs/architecture/data-access.md) requires. `useReviews` is
the page's single read hook, relocated verbatim from the page's inline `useQuery` during the
small-features migration (task 15) — same tables, same column selections, same filters and
ordering, same `refetchInterval`. The feature has no writes, so it has no accompanying
`<feature>-data.test.ts`: the contract's unit-testing requirement is for extracted write functions
and for reads that cannot be hooks, and this feature's one read is a proper hook.

`isFinished` and `inReviewTab` also live in `review-data.ts`, beside `publishedVersionStatus`,
rather than in `reviews-page.tsx`, so another feature can read the tab rule without importing the
page component. `reviews-page.tsx` imports `inReviewTab` from there to filter its rows; the page
still declares its own `versionStatusTones`, which is presentation (a `StatusTone` per status for
the badge), not the tab rule.
