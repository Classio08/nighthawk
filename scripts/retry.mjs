// Run a command up to N times; succeed as soon as one attempt passes. Used for the real-time netcode test, which runs real clients against a real
// server with fake lag and is sensitive to machine load (on the pre-drop baseline it failed one check in roughly 2 of 5 runs on a busy machine).
// Every failed attempt is printed in full, so a flake is visible and never silently hidden; three failures in a row still fail the build.
//   node scripts/retry.mjs 3 node server/test/match.mjs
import { spawnSync } from 'node:child_process';
const [, , n, cmd, ...args] = process.argv;
const tries = Math.max(1, Number(n) || 1);
for (let i = 1; i <= tries; i++) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status === 0) { if (i > 1) console.log(`\n(passed on attempt ${i} of ${tries}; the ${i - 1} earlier attempt(s) above failed - flaky timing, see docs/MASTER_SYSTEMS.md "Known flaky")`); process.exit(0); }
  console.log(`\n--- attempt ${i} of ${tries} failed (exit ${r.status}) ---\n`);
}
process.exit(1);
