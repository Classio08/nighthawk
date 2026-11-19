# Campaign progression foundation

This is a small story / progression layer above the existing operation system. It does **not** create a second mission runner or modify the simulation. The existing DUST LANTERN and SIGNAL BLACKOUT classes remain the playable mission implementations. The next story beats follow the currently documented campaign spine: RELAY UPLINK and CONVOY AMBUSH as parallel Act II operations, BLACK GLASS, LAST LIGHT and THE BROKER as later acts. BLACK SITE remains a separate repeatable social-tactical mode.

## What this adds

- An ordered campaign registry with prerequisites and explicit `built` vs `planned` status.
- Server-result-driven unlocks, attempt/win records and bounded faction reputation.
- Idempotency through a unique server-generated run id.
- A reusable briefing and campaign UI renderer. It is not yet mounted into `main.js`, because Claude owns the current main-menu / operations integration branch.
- Faction names and story beats come from the existing proposal in `docs/STORY_AND_ROLES.md`; they remain proposals until the owner promotes them to canon.

## Trust boundary

`recordCampaignResult` is pure and does not persist anything. The caller must feed it a verified server-generated result. Do not expose it as an endpoint that accepts mission ids, success flags, score or reputation directly from the browser. The account backend should store the returned campaign state after a match has been resolved by `MatchRoom`.

The future multiplayer mission protocol must version and validate operation state before any mission is enabled online.
