import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';

const execute = promisify(execFile);
export async function tailscale(args) {
  const { stdout } = await execute('tailscale', args, { timeout: 30000, windowsHide: true });
  return stdout;
}

export function planHttps(target, status, config) {
  const upstream = new URL(target);
  if (upstream.protocol !== 'http:' || upstream.username || upstream.password ||
      upstream.pathname !== '/' || upstream.search || upstream.hash)
    throw Error('転送先には、このホストのxangiのHTTP URL（パスなし）を指定してください。');
  const ownIPs = status.Self?.TailscaleIPs ?? [];
  if (!['localhost', '127.0.0.1', '[::1]', ...ownIPs].includes(upstream.hostname))
    throw Error('転送先はlocalhostまたはこのTailscale端末自身のIPに限定しています。');
  if (status.BackendState !== 'Running')
    throw Error('先にこの端末のTailscaleでログインして接続してください。');
  const hostname = status.Self?.DNSName?.replace(/\.$/, '');
  if (!hostname || !/^[a-z0-9.-]+\.ts\.net$/i.test(hostname))
    throw Error('この端末のTailscale DNS名を取得できません。MagicDNSを確認してください。');
  const proxy = upstream.origin;
  // Reuse only a private HTTPS endpoint whose entire root maps to this xangi.
  for (const [authority, web] of Object.entries(config.Web ?? {})) {
    const port = Number(authority.slice(authority.lastIndexOf(':') + 1));
    if (authority !== `${hostname}:${port}` || !config.TCP?.[port]?.HTTPS ||
        config.AllowFunnel?.[authority] || Object.keys(web.Handlers ?? {}).length !== 1) continue;
    if (web.Handlers['/']?.Proxy?.replace(/\/$/, '') === proxy)
      return { url: `https://${hostname}:${port}/`, args: null, proxy };
  }
  for (let port = 18889; port < 18989; port++) {
    if (config.TCP?.[port] || Object.keys(config.Web ?? {}).some(k => k.endsWith(`:${port}`)) ||
        Object.keys(config.AllowFunnel ?? {}).some(k => k.endsWith(`:${port}`))) continue;
    return { url: `https://${hostname}:${port}/`, proxy,
      args: ['serve', '--bg', `--https=${port}`, proxy] };
  }
  throw Error('HTTPS用の空きポートが見つかりません。既存設定は変更していません。');
}

export async function setupHttps({ target, yes = false, check = false, run = tailscale, confirm }) {
  const inspect = async () => planHttps(target,
    JSON.parse(await run(['status', '--json'])),
    JSON.parse(await run(['serve', 'status', '--json'])));
  const plan = await inspect();
  console.log(JSON.stringify(plan, null, 2));
  if (check || !plan.args) return plan;
  if (!yes && !(await confirm(`この端末のxangiを同じTailscaleネットワークへHTTPSで接続可能にします。\n${plan.url}\n設定しますか？ [y/N] `)))
    return null;
  // Do not overwrite a listener added while the user was deciding.
  const current = await inspect();
  if (JSON.stringify(current) !== JSON.stringify(plan))
    throw Error('確認中にTailscale設定が変わりました。もう一度実行してください。');
  await run(plan.args);
  const verified = await inspect();
  if (verified.args || verified.url !== plan.url)
    throw Error('HTTPS設定の完了を確認できません。Tailscaleの承認画面や設定を確認してください。');
  console.log(`HTTPS設定を確認しました: ${verified.url}`);
  return verified;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let prompt;
  try {
    const args = process.argv.slice(2);
    const targetIndex = args.indexOf('--target');
    if (targetIndex < 0 || !args[targetIndex + 1])
      throw Error('Usage: node src/setup-https.mjs --target <xangi HTTP URL> [--check | --yes]');
    await setupHttps({ target: args[targetIndex + 1], yes: args.includes('--yes'),
      check: args.includes('--check'), confirm: async message => {
        if (!process.stdin.isTTY) throw Error('対話端末で実行するか、ユーザーの承認後に--yesを指定してください。');
        prompt = createInterface({ input: process.stdin, output: process.stdout });
        return /^(y|yes|ok|はい)$/i.test((await prompt.question(message)).trim());
      } });
  } catch (error) {
    console.error(error.message);
    if (error.stdout) console.error(error.stdout);
    if (error.stderr) console.error(error.stderr);
    console.error('Tailscale未導入・未接続の場合は https://tailscale.com/download から準備してください。権限エラーやHTTPS有効化の案内が出た場合は、その案内に従って承認後に再実行してください。Dockerの場合はホスト側で実行します。');
    process.exitCode = 1;
  } finally { prompt?.close(); }
}
