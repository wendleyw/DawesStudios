# Reviews

The page uses the shared floating client navigation/profile above a white title/action card on
the plain page background. Review filters sit inside the title card; below it, each row is one
line in a single bordered list: title, label (`V<N>` for a client version, `<board name> · Round
<N>` for a round), the review note (full text in its
tooltip), a status badge and the date. The status column has a fixed width so columns align; below
1000 px the note and date drop, and below 720 px the label moves under the title. Version
statuses map onto the shared badge tones in `reviews-page.tsx`. The same layout adapts to desktop and mobile without duplicating client
navigation in the sidebar.

`review-data.ts` owns the Supabase reads. Designer rows come from current `board_work_requests`,
with an optional embedded round and the authorized board name; initial tasks exist before R1.
Agency Studio review includes only current submitted requests. Closed/superseded work and Backlog
projects are excluded. Client/agency publication rows use the latest project V and its own review.
A client never queries internal requests/boards/rounds. Row links select the exact board or V.

`work-request.ts` provides the request status/label mapping shared with Designer Home. Neither
surface infers a designer task from project status or raw client feedback. `inReviewTab` owns tab
filtering; only clients/agency have an Approved tab. Private history stays accessible in the project.
`review-data.test.tsx` covers the three role-specific reads.

A decided version names who decided. The row's note column reads "Approved by <name> · <date>" or
"Changes requested by <name> · <date>" (the release note moves to its tooltip), from
`publication_reviews.reviewed_by`/`reviewed_at`, which `review_publication` records. Names come from
`useClientPeople`; a reviewer who left reads "<name> (left)" to the studio and "Former member" to
the client. Reviews decided before reviewers were recorded keep their note.
