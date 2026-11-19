// One-command friend test, no VPS and no money:  npm run host
//   - builds the game if dist/ is missing (or with --build)
//   - starts the game server on one port, which ALSO serves the game page (same origin: no CORS, no ?online= needed)
//   - prints the LAN link, and if `cloudflared` is installed opens a free Cloudflare quick tunnel and prints the public https link
// Options (or env):  --port=2567  --build  --no-tunnel  --tunnel=ssh (use localhost.run through plain ssh instead of cloudflared)
//   MATCH_SIZE, LOBBY_SECS, DIFFICULTY ... are the same server settings as `npm run server` (see docs/DEPLOY.md)
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, dflt) => { const a = process.argv.find((x) => x === `--${name}` || x.startsWith(`--${name}=`)); return a === undefined ? dflt : a.includes('=') ? a.split('=')[1] : true; };
const port = Number(arg('port', process.env.PORT ?? 2567));
const dist = resolve(root, 'dist');

if (arg('build', false) || !existsSync(resolve(dist, 'index.html'))) {
  console.log('Building the game (npm run build) ...');
  const r = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) { console.error('Build failed, see above.'); process.exit(1); }
}

process.env.STATIC_DIR = dist;
const { createServer } = await import('../server/src/index.js');
const env = process.env;
await createServer({ lobbySecs: Number(env.LOBBY_SECS ?? 15), total: Number(env.MATCH_SIZE ?? 8), vehicles: env.VEHICLES !== '0', loot: env.LOOT !== '0', drop: env.DROP !== '0', compress: env.COMPRESS !== '0', difficulty: env.DIFFICULTY ?? 'normal', maxRooms: Number(env.MAX_ROOMS ?? 4), reconnectSecs: Number(env.RECONNECT_SECS ?? 12), staticDir: dist }).listen(port);

console.log(`\nNIGHTHAWK is up.  Match fills with bots after ${env.LOBBY_SECS ?? 15} s, up to ${env.MATCH_SIZE ?? 8} fighters.`);
console.log(`  This computer:  http://localhost:${port}/`);
for (const list of Object.values(networkInterfaces())) for (const n of list ?? []) if (n.family === 'IPv4' && !n.internal) console.log(`  Same Wi-Fi:     http://${n.address}:${port}/`);
console.log('  (the PLAY ONLINE button finds this server by itself)\n');

const tunnel = arg('tunnel', 'cloudflared');
if (arg('no-tunnel', false) || tunnel === 'none') { console.log('Tunnel off. Only people on your network can join.'); }
else {
  const useSsh = tunnel === 'ssh';
  const cmd = useSsh ? 'ssh' : 'cloudflared';
  const args = useSsh ? ['-o', 'StrictHostKeyChecking=accept-new', '-o', 'ServerAliveInterval=30', '-R', `80:localhost:${port}`, 'nokey@localhost.run']
    : ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`];
  const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let shown = false;
  const scan = (buf) => {
    const m = String(buf).match(/https:\/\/[a-z0-9-]+\.(?:trycloudflare\.com|lhr\.life|localhost\.run)/i);
    if (m && !shown) { shown = true; console.log(`\n>>> SEND THIS LINK TO YOUR FRIEND:  ${m[0]}/\n    (changes every time you restart; works only while this window stays open)\n`); }
  };
  child.stdout.on('data', scan); child.stderr.on('data', scan);
  child.on('error', () => {
    console.log(useSsh ? 'ssh not found.' : 'cloudflared is not installed, so there is no public link yet. Free, one-time install:');
    if (!useSsh) console.log('  Windows:  winget install Cloudflare.cloudflared\n  macOS:    brew install cloudflared\n  Linux:    https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/\nThen run  npm run host  again. Or try:  npm run host -- --tunnel=ssh   (no install, needs ssh)');
  });
  child.on('exit', (code) => { if (!shown) console.log(`Tunnel program exited (${code}) before giving a link. Players on your Wi-Fi can still use the links above.`); });
  const stop = () => { try { child.kill(); } catch { /* already gone */ } process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
