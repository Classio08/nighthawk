# NIGHTHAWK — Streamer, creator and community platform

**Status:** product and technical architecture proposal. These capabilities are not represented as implemented unless explicitly marked below.
**Design principle:** creators should help people discover and enjoy NIGHTHAWK without gaining privileged access to match state, private player data or competitive advantages.

## 1. Creator experiences

Build in layers. A streamer should get value before the full user-generated-content platform exists.

### A. Streamer mode (first)

A one-click privacy and presentation preset:
- hide account email, wallet address, internal player/account IDs and moderation details;
- configurable callsign masking (random alias per stream/session);
- hide party invite codes, private lobby IDs, server addresses and friend presence;
- delay or suppress sensitive lobby information; optional stream-safe lobby queue;
- disable incoming friend/party popups and private message previews;
- optional spectator delay for competitive modes;
- separate control for public HUD, objective feed, kill feed and voice/chat overlays;
- copyright-safe audio profile: mute/replace licensed music, keep gameplay/radio cues;
- explicit recording/streaming indicator and quick exit from privacy mode.

Streamer mode must not hide required competitive information from opponents or create a tactical advantage. Privacy masking is presentation-only and cannot change server identity or audit records.

### B. Shareable moments (second)

Current baseline: an end-of-match snapshot card exists and can be saved as PNG. A rolling replay buffer, killcam, clip export and streamer tools are planned, not built.

Proposed pipeline:
1. Record a bounded, server-authoritative event timeline (match start, kills, assists, objective changes, damage, extraction, vehicle events) with server tick and stable entity IDs.
2. Maintain a short client presentation buffer for the local player's recent view. Do not assume a client clip is authoritative evidence.
3. For a killcam/replay, reconstruct from server-approved state snapshots and inputs, not by trusting a client-supplied camera transform.
4. Provide a review screen with scrub, camera mode, captions, event markers and privacy controls.
5. Export a short WebM/MP4 where supported; provide a no-export fallback and avoid blocking gameplay.
6. Strip private IDs, wallet addresses, IPs, lobby secrets and hidden enemy state from exported metadata.
7. Add a visible disclosure when a clip is client-recorded or reconstructed; preserve evidence provenance for moderation appeals.

Clip controls: hide own callsign, hide other players' callsigns, remove voice, remove HUD, redact chat, include subtitles, choose first-/third-person replay camera and select a clip duration. Default to privacy-safe output.

### C. Creator studio (third)

A browser-based creator workspace:
- create a mission/operation from approved templates;
- choose allowed map POIs, time/weather preset, faction roster, objective graph and optional story beats;
- add dialogue from a constrained text field and choose from approved voice/radio styles;
- author NPC intent profiles from safe presets (guard, patrol, investigator, escort, witness, rival);
- set mission length, difficulty, objectives, extraction and reward class;
- preview in a private sandbox; save drafts and versions;
- submit for moderation and community publication.

Do not initially expose arbitrary JavaScript, shader code, executable mods, custom network code or unrestricted model uploads. Use a declarative schema with a strict allow-list of mission actions and bounded resource budgets. The server validates every published mission and executes it in the same authoritative mission framework.

## 2. Creator content types and permissions

| Content type | Initial policy | Runtime rule |
|---|---|---|
| Mission scenario | template-based, moderated | server validates objective graph and resource budget |
| Story / dialogue | text + approved voice options | no arbitrary engine commands or hate/harassment |
| Cosmetic design | creator-submitted texture/model package | quarantine, licence review, parser sandbox, visual review |
| Stream overlay | approved event feed + local overlay | never expose hidden opponent state |
| Replay / clip | event-based reconstruction | redact private and hidden information |
| Community guide | text/images/links | report, moderation, takedown process |
| Mods / scripts | not in initial creator release | no arbitrary executable content |

Creator submissions need:
- creator account and verified contact channel;
- rights declaration and proof of permission for every included asset, voice, likeness, music and trademark;
- content rating and region/platform eligibility;
- asset hashes, version, source files and changelog;
- AI-generated-content disclosure where applicable;
- moderation state, reviewer and decision reason;
- takedown and appeal route.

A creator must not upload another person's face/voice or a real unit insignia without documented permission. Do not use public social-media photos as training or likeness assets.

## 3. Creator economy — no speculative payouts

The first creator program should reward participation without money:
- featured placement and creator profile;
- verified creator badge after review;
- playtest access and editorial feedback;
- non-transferable in-game recognition cosmetics;
- mission analytics aggregated and privacy-safe.

Later, if the platform has real players and a compliant payment arrangement, creator revenue share can be introduced for approved cosmetics or mission packs. Keep the economics transparent:
- publish the revenue-share formula and eligible sales;
- account for taxes, payment fees, refunds and chargebacks;
- hold proceeds until the return/chargeback window passes;
- require rights verification and identity/tax checks through suitable providers;
- use auditable ledger entries and periodic statements;
- no direct wallet payouts, token rewards, staking or player-funded prize pools in this workstream.

Never imply creators will earn income until an approved provider, contracts, regional compliance and payout operations are actually in place.

## 4. Safety, moderation and anti-abuse

Before public uploads or social publishing:
- report mission, creator, comment, profile and clip;
- block/mute and privacy controls;
- review queue with severity and SLA;
- copyright/IP complaint and counter-notice/takedown flow;
- age/content rating and regional availability;
- profanity, slur, personal data and doxxing checks;
- human review for context-sensitive cases;
- creator appeal and strike history;
- rate limits, spam detection and upload quotas;
- no public free-text chat until moderation is staffed and tested.

Do not allow creator content to reveal a player's precise location, real name, wallet address or private communications.

## 5. Technical architecture

Keep the game simulation separate from creator tools:
- `Creator API`: draft CRUD, versioning, submission, publication state.
- `Mission schema validator`: JSON schema + semantic checks; rejects unknown actions and unbounded loops.
- `Asset ingestion worker`: MIME sniffing, file-size quotas, malware scan, metadata extraction and sandboxed model/texture parsing.
- `Moderation service`: automated triage plus human decision and appeal.
- `Published content registry`: immutable version IDs and hashes.
- `Match content loader`: fetches only approved versions; pins the version for the match.
- `Event/replay service`: bounded timeline and approved snapshot stream.
- `Overlay client`: local browser source / OBS browser source consuming a read-only, scoped event feed.

Creator content must never be able to call server filesystem, network, process, database or arbitrary simulation APIs. Mission JSON is data, not code. Apply a maximum objective count, NPC count, asset bytes, dialogue length, event rate and mission duration.

## 6. OBS / streaming overlay design

Provide a local browser-source URL with a short-lived, revocable, read-only token. Scope it to one active match and only approved public events. The token:
- is not the game account bearer token;
- cannot control the game or request hidden enemy positions;
- expires quickly and can be revoked from the game UI;
- is never included in a clip or screenshot;
- can be rotated without changing the player's account session.

Overlay widgets:
- match / mission title and public objective status;
- squad roster using masked callsigns;
- event ticker (public kills, assists, objective progress);
- personal performance card after the match;
- optional creator branding area with strict dimensions and approved image formats.

No viewer-triggered gameplay actions, paid sabotage, bounty on real players or stream-sniping tools. If interactive audience features are ever considered, they must be opt-in, sandboxed and fair to all players.

## 7. Rollout

1. Streamer privacy mode + event-safe overlay contract.
2. Better share cards and match-end highlights using existing snapshot card.
3. Bounded replay/event recorder and killcam.
4. Private mission creator using approved templates.
5. Submission/moderation/publishing workflow.
6. Community discovery, ratings and creator analytics.
7. Only then evaluate creator monetisation, after real usage, moderation capacity and compliance review.

## 8. Success measures

Measure creator activation, published mission completion rate, repeat plays, clip shares, privacy incidents, report rate, moderation time, creator retention, replay CPU/memory cost and effect on match frame time. Do not optimise for raw uploads or time spent in menus.
