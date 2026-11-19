# NIGHTHAWK — Claude Code project instructions

Before planning or changing code, read these files in order:
1. `docs/PROJECT_DIRECTION_AND_CHAT_NOTES.md` — latest owner-approved product direction and decisions.
2. `docs/CLAUDE_HANDOFF.md` — current engineering handoff and sprint priorities.
3. `docs/ROADMAP.md` and `docs/MASTER_SYSTEMS.md` — actual implementation status.
4. The relevant source files and tests. Verify the code, not just the documents.

## Working rules
- The owner wants a complete, replayable tactical shooter platform, not only a battle-royale prototype.
- The latest owner-approved direction in `docs/PROJECT_DIRECTION_AND_CHAT_NOTES.md` supersedes older conflicting sprint notes in this repository.
- Keep the existing Three.js + Rapier + Colyseus architecture unless measured evidence justifies a change.
- Server authoritative for multiplayer movement, damage, objective state, inventory, progression and match outcomes.
- Never claim an unimplemented feature is complete. Clearly separate shipped, prototype, planned and legally blocked work.
- Use small, reviewable feature branches and draft pull requests. Never merge or rewrite another contributor's branch.
- Avoid adding dependencies without a measured technical need. Keep all external assets licensed and documented.
- Run `npm run check`; report the exact result. Do not claim browser playtesting or performance measurements unless actually performed.
- Do not introduce real-money wagering, crypto staking, cash-out, token rewards or custody. See the Namibia compliance gate in the project direction notes.
- Do not put an LLM in control of authoritative combat, movement, hit detection or physics. AI reasoning must be bounded, testable and optional.

## Immediate owner-approved focus
Build and validate the first offline playable operation, **Operation DUST LANTERN**, as a vertical slice on top of the current simulation. Keep it isolated from online multiplayer until mission state has a versioned server snapshot protocol and server tests. See the mission acceptance criteria in `docs/PROJECT_DIRECTION_AND_CHAT_NOTES.md`.

When starting a new task, first check the latest main SHA, open PRs and work in progress. Do not assume an older handoff describes the latest repository state.
