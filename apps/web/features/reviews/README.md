# Reviews

The page uses the shared floating client navigation/profile above a white title/action card on
the plain page background. Review filters sit inside the title card; below it, each row is one
line in a single bordered list: title, label (`V<N>` for a client version, `<board name> · Round
<N>` for a round), the review note (full text in its
tooltip), a status badge and the date. The status column has a fixed width so columns align; below
1000 px the note and date drop, and below 720 px the label moves under the title. Version
statuses map onto the shared badge tones in `reviews-page.tsx`. The same layout adapts to desktop and mobile without duplicating client
navigation in the sidebar.

`reviews-page.tsx` lists work on the Miro workspace model: a designer sees the latest round of each
of their own design boards; the agency and the client see the latest client version of each
project (awaiting or decided by the client); the agency also sees every round a designer has
submitted for studio review (**Studio review**). No row carries a deliverable label.
`inReviewTab` decides which tab shows a row. A client's **Waiting for you** holds only versions
still waiting on their decision; a version they sent back is waiting on the studio and appears under
**With the studio**, and an approved one under **Approved**.

`review-data.ts` owns the feature's Supabase access, as
[the data-access contract](../../../../docs/architecture/data-access.md) requires. `useReviews` is
the page's single read hook. Rounds are `design_versions` rows with a `board_id` (named columns;
`created_by` is not readable), labelled through a `design_boards` read of `id,name`; client
versions are `published_versions` rows with `deliverable_id is null`, embedding their
`publication_reviews` decision (`status,reviewed_by,reviewed_at`). Both filters leave out the
legacy per-deliverable versions still stored until they are deleted. A client session never reads
`design_versions` or `design_boards`. `review-data.test.tsx` covers the three roles' reads.

`isFinished` and `inReviewTab` also live in `review-data.ts`, beside `publishedVersionStatus`,
rather than in `reviews-page.tsx`, so another feature can read the tab rule without importing the
page component. `reviews-page.tsx` imports `inReviewTab` from there to filter its rows; the page
still declares its own `versionStatusTones`, which is presentation (a `StatusTone` per status for
the badge), not the tab rule.

A decided version names who decided. The row's note column reads "Approved by <name> · <date>" or
"Changes requested by <name> · <date>" (the release note moves to its tooltip), from
`publication_reviews.reviewed_by`/`reviewed_at`, which `review_publication` records. Names come from
`useClientPeople`; a reviewer who left reads "<name> (left)" to the studio and "Former member" to
the client. Reviews decided before reviewers were recorded keep their note.
