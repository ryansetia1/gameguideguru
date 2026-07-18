# Troubleshooting

Notes for humans and coding agents debugging recurring issues. Search this file
before changing auth or Steam link code.

## Connect Steam: OpenID succeeds but account never links

### Symptom

- User clicks **Connect Steam**, signs in on Steam, returns to the app.
- Sidebar still shows **Connect Steam** (not **Steam library**).
- No user-visible error in the common case (`no_steam_session` is swallowed).
- Server log: `Steam link failed: Auth session missing!`
- `POST /api/steam/link` returns `500` with `{ "error": "link_failed" }`.

Earlier steps usually **work**: `GET /api/steam/login` redirects to Steam,
`GET /api/steam/callback` verifies OpenID and sets the `gg_steam` cookie, and the
client sees `/?steam=linked`.

### Root cause

`@supabase/supabase-js` on the **server** treats read and write auth differently:

| API | Bearer token in `global.headers` only |
|-----|----------------------------------------|
| `auth.getUser()` | Works — validates the JWT directly |
| `auth.updateUser()` | **Fails** — requires a hydrated client session |

A server route that does this will pass `getUser()` but fail at link time:

```ts
createClient(url, anonKey, {
  global: { headers: { Authorization: `Bearer ${accessToken}` } },
});
await supabase.auth.getUser();      // ok
await supabase.auth.updateUser();   // throws "Auth session missing!"
```

Client-side `updateUser()` (e.g. profile menu) works because the browser client
already holds a full session.

### Fix (required pattern)

1. **Client** (`linkSteamToAccount` in `app/page.tsx`): send `access_token` in
   `Authorization` and `refresh_token` in the POST body.
2. **Server** (`app/api/steam/link/route.ts`): `setSession({ access_token,
   refresh_token })`, then `updateUser({ data: { steam_id } })`.

Do **not** “fix” this by switching to the service-role key unless you deliberately
want admin-style user updates — the refresh-token + `setSession` path is the
intended design here.

### Misdiagnosis traps

- **`GET /api/steam/me` returns `steamId: null` while signed in** — intentional.
  When authenticated, that route trusts only `user_metadata.steam_id`, not the
  `gg_steam` device cookie. Do not use it to decide whether linking can proceed;
  the cookie is consumed by `POST /api/steam/link`.
- **OpenID / callback / cookie issues** — if callback logs show verification
  success and `gg_steam` is set, the failure is almost certainly the Supabase
  session pattern above, not Steam OpenID.
- **Pre-checking `/api/steam/me` before link** — was a prior bug: it always
  returned null for unlinked authed users and aborted linking before
  `POST /api/steam/link` ran.

### Related files

- `app/page.tsx` — `linkSteamToAccount`, `?steam=linked` handler
- `app/api/steam/link/route.ts` — persists `steam_id` to `user_metadata`
- `app/api/steam/callback/route.ts` — sets `gg_steam` after OpenID
- `lib/steam-session.js` — HMAC cookie signing/verification
