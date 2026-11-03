import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

const args = process.argv.slice(2);
if (args.length !== 3 || args[0] !== 'serve' || args[1] !== '--workspace' || !isAbsolute(args[2]))
  throw Error('Usage: node src/extension.mjs serve --workspace <absolute path>');
const token = process.env.XANGI_EXTENSION_AUTH_TOKEN;
if (!token) throw Error('XANGI_EXTENSION_AUTH_TOKEN is required');
const expected = Buffer.from(`Bearer ${token}`);
const assets = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/composer/': ['composer.html', 'text/html; charset=utf-8'],
  '/composer/voice.js': ['voice.js', 'text/javascript; charset=utf-8'],
  '/composer/voice.css': ['voice.css', 'text/css; charset=utf-8'],
};
const server = createServer(async (req, res) => {
  const supplied = Buffer.from(req.headers.authorization || '');
  const send = (status, body, type = 'application/json') => {
    res.writeHead(status, {
      'Content-Type': type,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy':
        "default-src 'none'; script-src 'self'; style-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
    });
    res.end(body);
  };
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
    return send(401, '{"error":"Unauthorized"}');
  if (req.method !== 'GET') return send(405, '{"error":"GET required"}');
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/health') return send(200, '{"ok":true,"id":"xangi-voice-input"}');
  const asset = Object.hasOwn(assets, path) ? assets[path] : undefined;
  if (!asset) return send(404, '{"error":"Not found"}');
  try {
    send(200, await readFile(new URL(`../public/${asset[0]}`, import.meta.url)), asset[1]);
  } catch {
    send(500, '{"error":"Asset unavailable"}');
  }
});
await new Promise((done, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', done);
});
console.log(
  JSON.stringify({
    schemaVersion: 2,
    event: 'ready',
    id: 'xangi-voice-input',
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    workspace: resolve(args[2]),
  })
);
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  server.close(() => process.stdin.destroy());
  server.closeAllConnections();
};
process.stdin.resume();
process.stdin.once('end', stop);
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
