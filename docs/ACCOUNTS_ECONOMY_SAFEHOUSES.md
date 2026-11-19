# Accounts, soft economy, safehouses and community servers

## Guest-first identity

- A guest account is created automatically the first time an online browser requests a match ticket.
- The browser keeps one opaque random session token in local storage; the server stores only its SHA-256 hash. The token is not a password and the account has no email or personal profile yet.
- A short-lived one-use room ticket is issued from that session and consumed by Colyseus `MatchRoom.onAuth`. A copied ticket expires after 60 seconds and cannot be reused.
- `MatchRoom` associates the authenticated account with its fighter. It awards XP / soft credits only from the server's authoritative `end` event, with a server-generated room/fighter idempotency key.
- Account file data lives under `NIGHTHAWK_DATA_DIR` (default `var/nighthawk`) and must never be committed. File writes are serialized and atomically renamed.

**Important limits:** this is a one-server JSON persistence foundation, not yet a production account platform. No email/password/social login, recovery flow, cross-device account linking, Postgres, multi-process transaction support, anti-fraud review or privacy/deletion workflow exists yet. Browser storage is accessible to same-origin JavaScript, so a future secure deployment should move the long-lived session to an HttpOnly cookie and use a same-origin ticket endpoint. Use HTTPS/WSS and a restrictive CSP before inviting players.

## Intel Credits and cosmetics

- Match rewards are server-issued and capped; the browser cannot request XP or credit awards.
- Credits are not transferable, redeemable, convertible, wagerable or tradeable. They have no cash value.
- The store catalog contains cosmetic skins, uniforms and identity plates only.
- No paid checkout, ad reward, player marketplace, token or wallet is wired in this branch.

## Safehouses

A safehouse purchase records one permanent deed per guest account at Basin Yard, Dry River or Relay Ridge. It is a property/identity foundation only. No stash, combat bonus, private weapons, offline raiding, upkeep, raids or map teleport is enabled yet. Those features need a persistent item ledger, permission model, protection windows, audit logs and moderation.

## Community server directory

Each game server can heartbeat public metadata to `POST /api/v1/community/heartbeat` using `NIGHTHAWK_REGISTRY_SECRET` in the `X-NH-Registry-Key` header. Players fetch public entries at `GET /api/v1/community/servers`. Entries expire after 45 seconds without a heartbeat. The registry currently lives in one process; multiple coordinators / regions need a shared database or Redis.

## Client integration

`src/net/account-session.js` creates the guest and one-use join ticket. `NetSim.join` uses the ticket when available, but falls back to anonymous join if the account API is not configured. `src/ui/economy-panel.js` is a reusable UI component for account balance, cosmetics, safehouse deeds and community listings; the owner/Claude can mount it into the current main menu without replacing the game loop.
