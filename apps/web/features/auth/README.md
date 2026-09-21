# Auth

`auth-provider.tsx` owns session handling and exports `useAuth()`, consumed by every other feature
in the app (48 call sites at the time of this migration). It creates the browser Supabase client,
subscribes to `onAuthStateChange`, resolves the initial session with `getSession()`, and clears the
query cache when the signed-in user changes.

## The one query: moved, not exempted

`auth-provider.tsx` held one `.from(`/`.rpc(`/`.storage.` query: the signed-in user's own profile
row, read in `SessionProvider` via an inline `useQuery`. During the small-features migration
(task 15) this was relocated to `useProfile` in the new `auth-data.ts`, and `SessionProvider` now
calls `const profileQuery = useProfile(database, session);` in the same place it built the query
inline.

This was a genuine "can it move" decision, not a default. The check performed: the profile query is
a plain `useQuery` at the top level of `SessionProvider`, not read inside the `onAuthStateChange` /
`getSession` effect and not branched on by it — that effect never inspects `profileQuery` at all.
Moving the query out to `useProfile` keeps the same number and order of hook calls in
`SessionProvider` (a custom hook that itself calls `useQuery` once does not change React's hook
bookkeeping), the same query key, the same `enabled: !!session` gate, and the same `select(...)
.single()`. `useAuth()`'s returned shape — `{ database, mediaUrl, session, profile, loading, error }`
— is unchanged, and so is the sequencing of `onAuthStateChange` versus `getSession()` in the effect
above it. Nothing about session lifecycle changed; only which file the query is defined in did.

The one deviation from the exemplar: `useProfile` takes `database` and `session` as explicit
parameters rather than calling `useAuth()` internally the way `useCreditAccount` and every other
feature's read hook does. `useProfile` is called from inside the component that defines and
provides `useAuth()`, so calling `useAuth()` from it would need a context `SessionProvider` has not
produced yet — this is the one hook in the app for which that part of the exemplar's shape does not
apply, and it is why `useProfile` stays in `features/auth/` beside the provider rather than being
mistaken for a hook any other feature should copy this shape from. The reason is also recorded above
`useProfile` in `auth-data.ts`.

No write functions were extracted: `auth-provider.tsx` has none, and `login-page.tsx`'s
`database.auth.signInWithPassword(...)` is Supabase Auth, not a `.from(`/`.rpc(`/`.storage.` call, so
it is outside the data-access contract's scope and stays in the component (matching the treatment of
`database.auth.updateUser(...)` in `settings/invitation-acceptance.tsx`, recorded in
`settings/settings-data.ts`).

## CSS boundary

`.spin` (the loading-spinner animation) is defined in `app/globals.css` but has exactly one consumer
in the whole app: `login-page.tsx`'s `<LoaderCircle className="spin" />`. Verified with:

```sh
grep -rn '\bspin\b' --include='*.tsx' --include='*.ts' --include='*.css' . --exclude-dir=node_modules --exclude-dir=.next
```

Reported per the migration's CSS-boundary check rather than edited, because `globals.css` is out of
scope for this migration.
