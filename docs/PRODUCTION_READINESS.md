# NIGHTHAWK — Production Readiness Gate

This checklist separates a playable local prototype from a public online release. A passing local test is not evidence of production readiness.

## Gate 0 — visual and gameplay slice

- [ ] First realistic operator loads from a GLB; placeholder remains available if loading fails.
- [ ] One 1K PBR ground material renders correctly under day/night/weather lighting.
- [ ] No baked shadows in base-colour maps; normal and roughness maps use linear data handling.
- [ ] Operator proportions, face likeness, gear silhouette and animations reviewed by the owner.
- [ ] FPP weapon and TPP weapon/hand alignment are visually consistent.
- [ ] A full match can start and finish with missing optional art assets.

## Gate 1 — external multiplayer test

- [ ] Deploy a staging server with TLS/WSS behind a reverse proxy.
- [ ] Confirm health endpoint, process restart policy, logs, metrics and graceful shutdown.
- [ ] Join from at least two genuinely separate internet connections.
- [ ] Test reconnect after tab refresh, temporary disconnect and server restart; document expected behaviour.
- [ ] Test 2, 8 and 16 human clients. Record server tick p50/p95/p99, room CPU, RSS memory, RTT, jitter and packet loss.
- [ ] Test 5% packet loss, 100–250 ms RTT and jitter bursts; verify the game remains understandable.
- [ ] Verify room cleanup, idle timeout, lobby timeout and abandoned-match behaviour.
- [ ] Record exact browser, OS, device, network and server region for each test.

## Gate 2 — security and abuse resistance

- [ ] Server validates movement bounds, fire cadence, ammo, reload state, cooldowns, inventory, objective actions and match phase.
- [ ] Validate message size, schema, numeric ranges and input frequency; reject malformed payloads.
- [ ] Apply per-connection and per-IP rate limits with safe reconnect handling.
- [ ] Never trust client hit claims, currency, XP, inventory, match result or unlock state.
- [ ] Add server-side audit events for match start/end, eliminations, rewards and moderation actions.
- [ ] Keep secrets and production credentials out of the browser bundle and repository.
- [ ] Add abuse reporting and a documented moderation escalation path before open chat or voice.

## Gate 3 — browser performance

- [ ] Profile on an ordinary integrated-GPU laptop and a mid-range Android device.
- [ ] Record cold and warm load time, first playable time, JS transfer, texture transfer, GPU memory estimate, frame-time p50/p95 and long tasks.
- [ ] Verify no shader compile or large texture decode causes a long freeze during a match.
- [ ] Test tab background/foreground, WebGL context loss and low-memory recovery.
- [ ] Verify reduced-motion, audio controls, readable HUD scaling and keyboard remapping.
- [ ] Add a low-quality preset that reduces shadows, particles, foliage and render scale.

## Gate 4 — privacy, platform and release

- [ ] Explain what telemetry is collected, why, retention period and opt-out.
- [ ] Use guest-first play; do not require account creation to try the game.
- [ ] If accounts are introduced, add account deletion/export and secure session handling.
- [ ] Review each portal's current rules for external links, ads, purchases, chat, analytics and account systems.
- [ ] Verify every shipped asset's source, exact licence and redistribution rights.
- [ ] Add versioned release notes, rollback procedure, incident contact and backup/restore test.

## Release decision

Do not label a gate complete without evidence: commit SHA, test command or run record, environment, measured result and known limitations. A checklist item can be marked blocked or not applicable with a reason.
