# Implementation queue (Grok, 19 Nov 2026)

Status: **work order, not implemented.** Runtime code is unchanged by this commit except owner-supplied portraits under `public/portraits/`.

Do not merge this branch into `main` until the owner says so. Do not reset Claude's branches. Do not import the local `raw-zips/` or `sorted-assets/` trees.

## Already written (read these, do not rewrite them)

| Doc | What it already decides |
|---|---|
| [ECONOMY.md](ECONOMY.md) | Closed-gate play-money ledger, wallet proof, NFT read |
| [ECONOMY_SECURITY_HARDENING.md](ECONOMY_SECURITY_HARDENING.md) | Four value domains, services, mint policy, threat model |
| [CREATOR_STREAMER_PLATFORM.md](CREATOR_STREAMER_PLATFORM.md) | Overlays, clips, mission creator, moderation |
| [CINEMATICS_CHARACTERS_ROLEPLAY.md](CINEMATICS_CHARACTERS_ROLEPLAY.md) | Timelines, dialogue, campaign beats |
| [STORY_AND_ROLES.md](STORY_AND_ROLES.md) | Dust Lantern → Signal Blackout → Black Glass → Last Light → The Broker |

## Next code, in order

1. **Security findings note, not a rewrite.** Diff current `src/economy/*` and `server/src/economy.js` against the threat table in `ECONOMY_SECURITY_HARDENING.md` §7. File gaps only. Do not add a second ledger.
2. **Portrait wiring.** Faces are now at `/portraits/<id>.jpg`. Operator select and the kill-feed can show them. Missing faces: `navy-blue`, `cliffhanger`. Fallback: operator colour block.
3. **Catalog stub.** A JSON catalog of cosmetic-only items (no prices that the client can invent). Server is the only writer of grants. Gate stays `off`.
4. **BLACK GLASS as data, then code.** Follow the "add the next operation" steps used for Signal Blackout. Stealth-first night vault. No new combat rules until the existing disguise/alert director is reused.
5. **Streamer overlay page.** A second HTML route that reads a local replay/kill feed and is safe to capture in OBS. No account required. Mask callsigns by default.
6. **Cutscene timeline prototype.** One briefing: camera, two lines of radio, then spawn into Dust Lantern. Client-only. Simulation does not wait on the camera.

## Explicitly not in this queue

- Live crypto, cash-out, staking, wagering, or a fungible token.
- Merging `feature/crypto-money-ecosystem` or old account branches.
- Committing third-party model packs.
- Deploy, VPS, or CI changes.
