# Research notes (19 November 2026)

Written after the owner asked for research on: how people run Vice City in a browser, open-source games and assets we could use, realistic player movement, Among-Us-style missions as a shooter, netcode/ping, monetisation (including wallets, NFTs and tokens), kill snapshots and social growth. This file separates **what we can use**, **what we can only learn from**, and **what is blocked**. Facts about outside projects, platforms and laws are from web research on this date; re-check each one before relying on it. Nothing here is legal advice.

## 1. How the Vice City browser port worked (study only)

- **What it was**: a reverse-engineered engine (reVC) compiled to WebAssembly and run in the browser by DOS.Zone in December 2025. It needed game files the player owns, and Take-Two had it taken down within about a week. A second site (Quenq) reposted a version afterwards. Whether it is still up is not something we should rely on.
- **Techniques that are learnable and legal for our own content**: WebAssembly for the engine; OPFS (origin private file system) to keep big assets on the player's device between visits; a Service Worker to cache and serve them offline; streaming assets in chunks so the first screen loads fast; loading the heavy files only after the menu is up.
- **What is unusable**: the game, its maps, art, audio and music are Rockstar / Take-Two property. A port of the *engine* is not permission to use the *content*. Do not ship, link to, mirror or "inspire from" those files. `ASSETS.md` already says this.
- **Lessons for NIGHTHAWK**: (a) our bundle is about 5 MB (1.9 MB gzipped) and the portal target is 8 MB, so streaming is a later problem, but the Service Worker + OPFS idea fits "download the real art pack once" when realistic models arrive; (b) a legally clean takedown-proof game is a feature when the whole business is a link on a portal.

## 2. Open source and licences

| Source | What it is | Verdict |
|---|---|---|
| three.js, Rapier, Yuka, Colyseus, zzfx | Our stack (MIT or similar, listed in `docs/TECH_STACK.md`) | Using |
| Notblox (iErcann) | A three.js + Rapier, server-authoritative ECS multiplayer game | **Study only.** Architecture is close to ours. Its engine licence (enari-engine) was not verified by me, so do not copy code. |
| Kenney, Quaternius, Poly Haven, ambientCG (CC0) | Models, PBR textures, sound | **Usable**, logged in `ASSETS.md` / `docs/ASSET_CATALOG.md` before anything is added |
| Four `.wav` sounds that arrived in an AI-generated "wired audio" pack (ghost beep, kill, two shots) | Provenance unknown | **Not integrated.** We cannot show where they came from. ZzFX presets already cover those sounds. If the owner made them, say so and they can go in `ASSETS.md` as project-authored. |
| Any GTA / Vice City / movie / commercial-game file, logo, character or soundtrack | n/a | **Blocked** |

## 3. Realistic player movement (what shipped and why)

Design rationale, not sourced to one article: tactical shooters read as "real" when the body has weight and the world has edges. Four things carry most of that, and all four are now in:

1. **Slide** (sprint, then C). A short, fast, low movement with a cooldown that bleeds off into a crouch walk. Starts only from a real sprint, ends when you stop, jump, get stunned or hit a wall. It is in the shared simulation, so a client prediction and the server agree.
2. **Mantle / vault**. Jump at a 0.15-0.7 m ledge within hand reach and you are pulled up and over (0.4 s), with a headroom check and a no-fire window. Tall building walls do not mantle.
3. **View motion** (`src/render/headbob.js`, client only): head bob locked to the same clock as the footstep sound, a dip when you land from a real drop (not from an ordinary jump), a tilt and wider FOV in a slide, a look-up in a mantle. Off by one setting ("HEAD BOB & CAMERA MOTION") or `?bob=0`, because camera motion makes some players sick.
4. **Body poses** for other players: slide and mantle flags travel in the snapshot (two spare bits), so remote players slide and climb on your screen.

**Deliberately not added**: coyote time, jump buffering, variable jump height (arcade-platformer tools; they would change authoritative movement), wall running, double jump, prone. Prone is a candidate for later; it needs a lower hit-box and a tuning pass.

**Tuned by ear / eye: no.** The slide, vault and landing sounds, the slide pose and the bob amplitudes are first guesses. Nobody has played them on a real device.

## 4. Among-Us-style missions in a shooter

What the genre gives us: a **task list that can be done in any order**, tasks that are **visible and interruptible**, and **pressure from a clock and from other players** rather than from a boss. SIGNAL BLACKOUT (`docs/MISSION_SIGNAL_BLACKOUT.md`) is the first use of it: three relay tasks, each a held action that a hit or a step away cancels, a loud ping to the garrison, and an 8-minute trace.

Not built on `main`: **social deduction / impostors**. ChatGPT's unmerged branch `feature/faction-operations-suite` has a hidden-role "Black Site" mode (tasks, sabotage, meetings, voting) that I have only seen as a file list and a dry-run merge; it is not reviewed or claimed here. Online play of any operation still needs the versioned mission snapshot first. A good later version is co-op: two to four players split the relays while guards react.

## 5. Netcode and ping

The decision from `docs/MULTIPLAYER.md` and the Colyseus 0.18 audit stands: server-authoritative at 60 Hz sim, 20 Hz snapshots, client prediction with reconciliation, lag-compensated hits, interpolation. Measured only on localhost with injected lag (about 1 ms tick, 24-40 KB/s per player). **Real-network numbers do not exist yet**: a VPS and a friend on another network is still the top open item. Slide and mantle ride on the same own-state reconcile path as everything else (own state now carries slide and mantle timers, and a test resumes a prediction in the middle of each).

## 6. Monetisation, wallets, NFTs, tokens

**Built into the plan**: ads at natural pauses and rewarded ads through a portal SDK, then cosmetic-only purchases (`docs/MONETIZATION.md`), then optional soft currency with a server ledger (roadmap P7).

**Not built, and not going to be built without written legal advice and the owner's explicit sign-off**:

- **NFTs, tokens, crypto wallets in the game, play-to-earn, staking, wagering, cash-out, custody.** `CLAUDE.md` forbids them, and the reasons are practical as well:
  - **Platforms**: Steam's rules ban games that issue or trade crypto or NFTs; Google Play has rules for tokenised digital assets; a portal like CrazyGames earns its money from SDK ads (whether a portal bans crypto features is something I did not verify). A crypto feature can cost us distribution.
  - **Namibia**: the Virtual Assets Act 2023 (Act 10 of 2023) makes the Bank of Namibia the regulator and requires licensing for virtual-asset service providers and token issuers. Real-money prizes or randomised paid rewards run into the Gaming and Entertainment Control Act 2018 (and a proposed software-lottery licence), which is also why paid loot boxes are off the table.
  - **Design**: pay-to-win and play-to-earn both push a shooter's economy toward the players who spend, and toward bots and farmers.
- The roadmap still holds **P8: wallet-linked proof of ownership of cosmetics only**, behind a legal, privacy and security review, and never asking for a seed phrase.
- A custom-character creator and chat are planned but need moderation first (`docs/MASTER_PRODUCT_PLAN.md`); portal builds may forbid free-text chat.

## 7. Kill snapshots, replays and social growth

- **Shipped**: end-of-match **snapshot card** (`src/ui/snapshot.js`). The last frame (the moment you went down, or the extraction) with a caption bar (result, operation, callsign, kills, time) and a SAVE button that downloads a PNG. Client-only: it reads a canvas and the final result, nothing in the simulation.
- **Planned, not built**: a rolling 10-second **kill replay** (needs a recorded input / state ring buffer; the deterministic simulation makes this cheap to do by re-simulating), a killcam from the killer's view, a share button (`navigator.share`) and a short clip export. Streamer-friendly options (a "hide my callsign" switch, no copyrighted music) belong with it.
- **Growth**: a link to a portal page is the whole funnel for a browser game. Short clips and a daily seeded mission ("same operation for everybody today") are the cheapest reasons for a person to send the link.

## 8. Open items from this research

1. Put the server on a VPS and test with a friend on another network.
2. Tune the new sounds by ear and play slide and mantle on a real device (and a phone, when touch controls land).
3. Decide a licence for the repository (it is public and `package.json` says `UNLICENSED`).
4. Owner decision on the four `.wav` files (provenance).
5. Legal review before *any* feature in section 6's "not built" list.
