# Campaigns

`campaign-dialog.tsx` is the whole feature: a dialog, opened from the briefing flow and the board,
that creates a new campaign for a client. `campaign-data.ts` owns its Supabase access, as
[the data-access contract](../../../../docs/architecture/data-access.md) requires — `createCampaign`
relocated verbatim from the dialog's mutation during the small-features migration (task 15).

`settings/settings-data.ts` separately owns `saveCampaign` (create-or-edit, used by
`settings/campaign-settings.tsx`) and its own `campaignQueryKeys` / `useInvalidateCampaigns`. This
module does not import from it: the two mutations invalidate the same `["campaigns"]` query key by
coincidence of domain, not by shared code, and each feature keeps its own copy of the pair per the
contract's per-feature invalidation rule.
