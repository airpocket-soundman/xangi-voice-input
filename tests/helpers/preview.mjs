import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const coreRoot = process.env.XANGI_CORE_PATH;
if (!coreRoot) throw Error('Set XANGI_CORE_PATH to the Xangi checkout with composer.input support');
const requireCore = createRequire(pathToFileURL(resolve(coreRoot, 'package.json')));
const {createServer} = await import(pathToFileURL(requireCore.resolve('vite')));
const {default:react} = await import(pathToFileURL(requireCore.resolve('@vitejs/plugin-react')));
const root = resolve(coreRoot, 'web-ui');

// Test only. This harness renders the real ChatPane without starting an agent,
// loading .env, or connecting to an installed Xangi service.
export async function createComposerPreview({
  port = 0,
  host = '127.0.0.1',
  allowedHosts = [],
} = {}) {
  const requests = [];
  const token = crypto.randomUUID();
  const extension = spawn(
    process.execPath,
    [
      fileURLToPath(
        new URL('../../src/extension.mjs', import.meta.url)
      ),
      'serve',
      '--workspace',
      process.cwd(),
    ],
    {
      env: { ...process.env, XANGI_EXTENSION_AUTH_TOKEN: token },
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'inherit'],
    }
  );
  const ready = JSON.parse(String((await once(extension.stdout, 'data'))[0]));
  const extensionBase = ready.baseUrl;

  const plugin = {
    name: 'local-voice-preview',
    enforce: 'pre',
    transform(code, id) {
      if (id.split('?')[0].endsWith('/Chat.tsx')) return code + '\nexport { ChatPane };';
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.startsWith('/api/extensions/xangi-voice-input/service/')) {
          const path = req.url
            .slice('/api/extensions/xangi-voice-input/service'.length)
            .split('?')[0];
          const response = await fetch(extensionBase + path, {
            headers: { authorization: `Bearer ${token}` },
          });
          res.statusCode = response.status;
          for (const [key, value] of response.headers)
            if (!['content-length', 'connection', 'transfer-encoding'].includes(key))
              res.setHeader(key, value);
          res.end(Buffer.from(await response.arrayBuffer()));
          return;
        }
        if (req.url?.startsWith('/api/')) {
          requests.push({ url: req.url, method: req.method });
          res.setHeader('Content-Type', 'application/json');
          if (req.method !== 'GET') {
            res.statusCode = 409;
            res.end(
              JSON.stringify({
                error: '音声入力テスト画面ではAIへ送信しません。下書きの内容を確認してください。',
              })
            );
          } else if (req.url.includes('external-chat-link')) {
            res.statusCode = 404;
            res.end('{}');
          } else if (req.url.includes('turn-history')) res.end(JSON.stringify({ history: [] }));
          else if (
            req.url.startsWith('/api/sessions/voice-test?') ||
            req.url.startsWith('/api/sessions/voice-other?')
          ) {
            res.end(
              JSON.stringify({
                id: req.url.includes('voice-other') ? 'voice-other' : 'voice-test',
                title: '音声入力テスト',
                platform: 'web',
                lifecycle: 'open',
                messages: [],
                hasMore: false,
              })
            );
          } else if (req.url.startsWith('/api/events/stream')) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.end(': local preview\n\n');
          } else res.end(JSON.stringify({ commands: [], models: [], workspaces: [] }));
          return;
        }
        if (req.url?.split('?')[0] !== '/voice-test') return next();
        const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Xangi 音声入力テスト</title>
          <style>.voice-preview{height:100%;display:grid;grid-template-rows:auto minmax(0,1fr);max-width:1000px;margin:auto}.voice-preview-header{padding:12px 16px;border-bottom:1px solid var(--border)}.voice-preview-header h1{font-size:18px;margin:0 0 6px}.voice-preview-header p{font-size:13px;margin:4px 0;color:var(--ink-secondary)}.voice-preview-body{min-height:0;display:grid}</style>
          </head><body><div id="root"></div><script type="module">
          import React from 'react';import {createRoot} from 'react-dom/client';import '/src/styles.css';import {ChatPane} from '/src/Chat.tsx';
          const noop=()=>{};window.__voicePreviewActive=true;
          function Preview(){const [enabled,setEnabled]=React.useState(true);window.__disableExtension=()=>setEnabled(false);const [session,setSession]=React.useState('voice-test');window.__voicePreviewSwitch=()=>setSession(s=>s==='voice-test'?'voice-other':'voice-test');return React.createElement('main',{className:'voice-preview'},
            React.createElement('header',{className:'voice-preview-header'},React.createElement('h1',null,'Xangi 音声入力テスト'),React.createElement('p',null,'入力欄のマイクを押して日本語で話し、停止して下書きを確認してください。キーボードを開く必要はありません。'),React.createElement('p',null,'音声はブラウザの認識サービスへ送信される場合があります。この画面から実際のAIへは送信しません。')),
            React.createElement('div',{className:'voice-preview-body'},React.createElement(ChatPane,{composerExtensions:enabled?[{id:'xangi-voice-input',displayName:'音声入力'}]:[],pane:{key:'voice-test',sessionId:session},active:true,config:{uploadAccept:null,uploadMaxBytes:67108864,allowedBackends:[],completionShowElapsed:true},refreshVersion:0,onFocus:noop,onClose:noop,onSessionChange:noop,onBusyChange:noop,onSessionsInvalidated:async()=>{},onComplete:noop,onAbortReady:noop})))}
          createRoot(document.getElementById('root')).render(React.createElement(Preview));
          </script></body></html>`;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(await server.transformIndexHtml('/voice-test', html));
      });
    },
  };
  const vite = await createServer({
    configFile: false,
    root,
    base: '/',
    plugins: [react(), plugin],
    server: { host, port, strictPort: true, allowedHosts },
    logLevel: 'error',
  });
  await vite.listen();
  const address = vite.httpServer.address();
  return {
    url: `http://localhost:${address.port}/voice-test`,
    requests,
    close: async () => {
      vite.httpServer.closeAllConnections();
      await vite.close();
      extension.stdin.end();
      await once(extension, 'exit');
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const preview = await createComposerPreview({
    port: Number(process.env.VOICE_PREVIEW_PORT || 5173),
    allowedHosts: (process.env.VOICE_PREVIEW_ALLOWED_HOSTS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  });
  console.log(`Voice input preview: ${preview.url}`);
  const close = () => void preview.close().then(() => process.exit());
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}
