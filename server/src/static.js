// Serves the built game (dist/) from the game server, so ONE process and ONE link (a free Cloudflare tunnel, a LAN address, a VPS) is the whole game.
// No new dependency: express (already under Colyseus) does the file sending; this file only decides WHICH file a URL may reach.
import { existsSync } from 'node:fs';
import { resolve, sep, normalize } from 'node:path';

const SKIP = /^\/(matchmake|health|metrics)(\/|$)/;           // routes that belong to the game server itself

/**
 * Map a URL path to a path RELATIVE to `root`, or null if it must not be served.
 * Pure, so it can be tested: refuses traversal (.., encoded or not), dotfiles, null bytes, backslashes and the server's own routes.
 */
export function resolveStatic(urlPath) {
  let p;
  try { p = decodeURIComponent(String(urlPath).split('?')[0].split('#')[0]); } catch { return null; }
  if (p.includes('\0') || p.includes('\\')) return null;
  if (SKIP.test(p)) return null;
  if (p === '/' || p === '') return 'index.html';
  if (p.split('/').some((seg) => seg === '..' || seg.startsWith('.'))) return null;        // checked BEFORE normalising: normalise would quietly turn /../x into /x
  const rel = normalize(p).replace(/^[/\\]+/, '');
  return rel.split(sep).some((seg) => seg === '..') ? null : rel;
}

/** @param app the express app from defineServer({ express })   @param dir folder with the built game */
export function attachStatic(app, dir) {
  const root = resolve(dir);
  if (!existsSync(resolve(root, 'index.html'))) return false;
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const rel = resolveStatic(req.path);
    if (!rel) return next();
    // hashed build assets never change: cache them for a year. index.html and the rest revalidate.
    const immutable = rel.startsWith('assets/');
    res.sendFile(rel, { root, dotfiles: 'deny', maxAge: immutable ? '365d' : 0, immutable, headers: { 'X-Content-Type-Options': 'nosniff' } }, (err) => { if (err) next(); });
  });
  return true;
}
