import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planHttps, setupHttps } from '../src/setup-https.mjs';

const status = { BackendState: 'Running', Self: { DNSName: 'example.tail123.ts.net.', TailscaleIPs: ['100.64.0.1'] } };
const target = 'http://127.0.0.1:18888';
const authority = 'example.tail123.ts.net:18889';
const configured = { TCP: {18889: { HTTPS: true }}, Web: {[authority]: { Handlers: {'/': { Proxy: target }} }} };

test('detects this device; preserves occupied listeners and rejects remote targets', () => {
  assert.equal(planHttps(target, status, {TCP: {18889: {TCPForward: 'other:80'}}}).url,
    'https://example.tail123.ts.net:18890/');
  assert.equal(planHttps(target, status, configured).args, null);
  assert.notEqual(planHttps(target, status, {...configured, AllowFunnel: {[authority]: true}}).args, null);
  assert.throws(() => planHttps('http://other-host:80', status, {}));
  assert.throws(() => planHttps(target, {...status, BackendState: 'NeedsLogin'}, {}));
  assert.throws(() => planHttps('http://127.0.0.1:18888/path', status, {}));
});

test('check and declined confirmation never modify Serve', async () => {
  const calls = [];
  const run = async args => { calls.push(args); return JSON.stringify(args[0] === 'status' ? status : {}); };
  await setupHttps({target, check: true, run});
  await setupHttps({target, run, confirm: async () => false});
  assert(calls.every(args => args.includes('--json')));
});

test('approved setup verifies result and reuses it on subsequent runs', async () => {
  let config = {}, writes = 0;
  const run = async args => {
    if (args.includes('--bg')) { writes++; config = configured; return ''; }
    return JSON.stringify(args[0] === 'status' ? status : config);
  };
  await setupHttps({target, yes: true, run});
  await setupHttps({target, yes: true, run});
  assert.equal(writes, 1);
});

test('settings changed during approval are not overwritten', async () => {
  let changed = false;
  const run = async args => {
    assert(!args.includes('--bg'));
    return JSON.stringify(args[0] === 'status' ? status : changed ? configured : {});
  };
  await assert.rejects(setupHttps({target, run, confirm: async () => { changed = true; return true; }}), /変わりました/);
});
