import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createComposerPreview } from '../helpers/preview.mjs';

const preview = await createComposerPreview();
const output = await mkdtemp(join(tmpdir(), 'xangi-voice-ui-'));
const chrome = spawn(
  process.env.XANGI_TEST_CHROMIUM || 'chromium',
  [
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    '--no-first-run',
    '--remote-debugging-port=0',
    '--user-data-dir=' + join(output, 'profile'),
    'about:blank',
  ],
  { windowsHide: true }
);
let ws;
const errors = [];
const mock = String.raw`
  window.__speechSessions=[];
  window.__composerBegins=[];
  window.__composerConfigs=[];
  window.addEventListener('message',e=>{if(e.data?.type==='xangi.composer.configure')window.__composerConfigs.push(e.data);});
  window.addEventListener('message',e=>{if(e.data?.type==='xangi.composer.begin')window.__composerBegins.push(e.data);});
  class FakeSpeechRecognition {
    constructor(){window.__speechSessions.push(this);}
    start(){this.started=true;this.onstart?.();}
    stop(){this.stopped=true;}
    abort(){this.aborted=true;this.onend?.();}
    result(rows){this.onresult?.({resultIndex:0,results:rows.map(([text,isFinal])=>({isFinal,0:{transcript:text}}))});}
    end(){this.onend?.();}
    fail(error){this.onerror?.({error});}
  }
  const mode=new URLSearchParams(window===parent?location.search:parent.location.search).get('mode');
  Object.defineProperty(window,'SpeechRecognition',{configurable:true,value:mode==='prefixed'||mode==='unsupported'?undefined:FakeSpeechRecognition});
  Object.defineProperty(window,'webkitSpeechRecognition',{configurable:true,value:mode==='prefixed'?FakeSpeechRecognition:undefined});
  if(mode==='insecure')Object.defineProperty(window,'isSecureContext',{configurable:true,value:false});
`;
try {
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error('Chromium startup timed out; set XANGI_TEST_CHROMIUM')),
      15000
    );
    chrome.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    chrome.stderr.on('data', (chunk) => {
      const match = String(chunk).match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    chrome.on('exit', (code) => {
      clearTimeout(timer);
      reject(Error('Chromium exited: ' + code));
    });
  });
  const targets = await fetch('http://127.0.0.1:' + new URL(endpoint).port + '/json/list').then(
    (r) => r.json()
  );
  ws = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      message.error ? entry.reject(message.error) : entry.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const response = await send('Runtime.evaluate', {
      expression: expression
        .replaceAll(
          'window.__speechSessions',
          'document.querySelector("iframe.composer-extension-frame").contentWindow.__speechSessions'
        )
        .replaceAll(
          'document.querySelector(".pane-voice-btn")',
          'document.querySelector("iframe.composer-extension-frame").contentDocument.querySelector("#mic")'
        ),
      returnByValue: true,
      awaitPromise: true,
    });
    if (response.exceptionDetails) throw Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };
  const wait = async (expression) => {
    const start = Date.now();
    while (Date.now() - start < 15000) {
      if (await evaluate('Boolean(' + expression + ')')) return;
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    throw Error('UI wait timed out: ' + expression + '\n' + JSON.stringify(errors));
  };
  const type = async (text) =>
    evaluate(
      `(()=>{const input=document.querySelector('.pane-input');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,${JSON.stringify(text)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`
    );
  const click = async (selector) => {
    const point = await evaluate(
      `(()=>{const frame=document.querySelector('iframe.composer-extension-frame');const target=${JSON.stringify(selector)}==='.pane-voice-btn'?frame:document.querySelector(${JSON.stringify(selector)});const r=target.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`
    );
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      button: 'left',
      clickCount: 1,
      ...point,
    });
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      button: 'left',
      clickCount: 1,
      ...point,
    });
  };
  const result = (rows) =>
    evaluate(`window.__speechSessions.at(-1).result(${JSON.stringify(rows)})`);
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: mock });
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await send('Page.navigate', { url: preview.url });
  await wait(
    'document.querySelector("iframe.composer-extension-frame")?.contentDocument?.querySelector("#mic")&&!document.querySelector(".pane-voice-btn").disabled'
  );
  await type('既存の文章');
  await evaluate('document.querySelector(".pane-input").focus()');
  await click('.pane-voice-btn');
  await wait('document.querySelector(".pane-voice-btn").getAttribute("aria-pressed")==="true"');
  assert.equal(
    await evaluate('document.activeElement===document.querySelector(".pane-input")'),
    false,
    'mic blurs the textarea'
  );
  assert.equal(await evaluate('window.__speechSessions.at(-1).lang'), 'ja-JP');
  assert.equal(await evaluate('window.__speechSessions.at(-1).continuous'), false);
  await wait('document.querySelector(".pane-send").disabled');
  await result([['こんにちは', false]]);
  await wait('document.querySelector(".composer-extension-status")?.textContent==="こんにちは"');
  assert.equal(await evaluate('document.querySelector(".pane-input").value'), '既存の文章');
  await result([['こんにちは', true]]);
  await wait('document.querySelector(".pane-input").value==="既存の文章\\nこんにちは"');
  await evaluate(
    `(()=>{const frame=document.querySelector('iframe.composer-extension-frame');const valid=window.__composerBegins.at(-1);for(const [origin,source,extra] of [[location.origin,window,{}],['https://invalid.example',frame.contentWindow,{}],[location.origin,frame.contentWindow,{contextId:'stale'}],[location.origin,frame.contentWindow,{requestId:'wrong'}],[location.origin,frame.contentWindow,{revision:1}]])window.dispatchEvent(new MessageEvent('message',{origin,source,data:{...valid,type:'xangi.composer.update',revision:999,text:'不正な上書き',...extra}}));})()`
  );
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(
    await evaluate('document.querySelector(".pane-input").value'),
    '既存の文章\nこんにちは',
    'source, origin, context, operation and revision are checked'
  );
  await result([['こんにちは', true]]);
  assert.equal(
    await evaluate('document.querySelector(".pane-input").value'),
    '既存の文章\nこんにちは',
    'duplicate finals ignored'
  );
  await result([
    ['こんにちは', true],
    ['こんにちは このザンギ', true],
  ]);
  await wait('document.querySelector(".pane-input").value==="既存の文章\\nこんにちは このザンギ"');
  await result([
    ['こんにちは', true],
    ['こんにちは このザンギ', true],
    ['こんにちは このザンギ側で', false],
  ]);
  assert.equal(
    await evaluate('document.querySelector(".pane-input").value'),
    '既存の文章\nこんにちは このザンギ'
  );
  await result([['こんにちは このxangi側で調整できますか', true]]);
  await wait(
    'document.querySelector(".pane-input").value==="既存の文章\\nこんにちは このxangi側で調整できますか"'
  );
  await result([
    ['こんにちは このxangi側で調整できますか', true],
    ['こんにちは このxangi側で調整できますか', true],
  ]);
  assert.equal(
    await evaluate('document.querySelector(".pane-input").value'),
    '既存の文章\nこんにちは このxangi側で調整できますか'
  );
  await result([['はい、はい。', true]]);
  await wait('document.querySelector(".pane-input").value==="既存の文章\\nはい、はい。"');
  await evaluate('window.__beforeEdit=window.__speechSessions.at(-1).onresult');
  await type('既存の文章\nはい、はい。（手入力）');
  await wait('window.__speechSessions.at(-1).aborted');
  await evaluate(
    'window.__beforeEdit({resultIndex:0,results:[{isFinal:true,0:{transcript:"手入力を上書きしない"}}]})'
  );
  assert.equal(
    await evaluate('document.querySelector(".pane-input").value'),
    '既存の文章\nはい、はい。（手入力）'
  );
  await click('.pane-voice-btn');
  await result([['続きです', true]]);
  await wait('document.querySelector(".pane-input").value.endsWith("（手入力）\\n続きです")');
  await evaluate(
    'document.querySelector(".pane-input").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}))'
  );
  assert.equal(
    preview.requests.some((req) => req.method === 'POST'),
    false,
    'no send while recording'
  );
  await click('.pane-voice-btn');
  await wait('window.__speechSessions.at(-1).stopped');
  await result([['続きです。', true]]);
  await evaluate('window.__speechSessions.at(-1).end()');
  await wait('document.querySelector(".pane-voice-btn").getAttribute("aria-pressed")==="false"');
  await wait('document.querySelector(".pane-input").value.endsWith("続きです。")');
  await wait('!document.querySelector(".pane-send").disabled');
  assert.equal(
    await evaluate('document.querySelector(".pane-input").value'),
    '既存の文章\nはい、はい。（手入力）\n続きです。'
  );
  assert.equal(await evaluate('document.querySelector(".pane-send").disabled'), false);
  assert.equal(
    await evaluate('document.activeElement===document.querySelector(".pane-input")'),
    false,
    'results never focus the textarea'
  );
  await click('.pane-voice-btn');
  await evaluate('window.__speechSessions.at(-1).fail("not-allowed")');
  await wait(
    'document.querySelector(".composer-extension-status")?.textContent.includes("許可されていません")'
  );
  await click('.pane-voice-btn');
  await result([['認識中の表示', false]]);
  await wait('document.querySelector(".composer-extension-status")?.textContent==="認識中の表示"');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(output, 'voice-mobile.png'), Buffer.from(shot.data, 'base64'));
  await evaluate(
    'window.__oldSpeech=window.__speechSessions.at(-1);window.__oldResult=window.__oldSpeech.onresult;window.__voicePreviewSwitch()'
  );
  await wait('window.__oldSpeech.aborted');
  const before = await evaluate('document.querySelector(".pane-input").value');
  await evaluate(
    'window.__oldResult({resultIndex:0,results:[{isFinal:true,0:{transcript:"別の会話へ混入"}}]})'
  );
  assert.equal(
    await evaluate('document.querySelector(".pane-input").value'),
    before,
    'late results cannot cross conversations'
  );
  await click('.pane-voice-btn');
  await evaluate(
    'window.__hiddenSpeech=window.__speechSessions.at(-1);Object.defineProperty(document,"hidden",{configurable:true,value:true});document.dispatchEvent(new Event("visibilitychange"))'
  );
  await wait('window.__hiddenSpeech.aborted');
  await evaluate('Object.defineProperty(document,"hidden",{configurable:true,value:false})');
  await evaluate(`(()=>{const f=document.querySelector('iframe.composer-extension-frame');const c=f.contentWindow.__composerConfigs.at(-1);f.contentWindow.postMessage({...c, capabilities:undefined},location.origin);})()`);
  await wait('document.querySelector(".pane-voice-btn").disabled');
  for (const mode of ['prefixed', 'unsupported', 'insecure']) {
    await send('Page.navigate', { url: preview.url + '?mode=' + mode });
    await wait(
      'document.querySelector(".pane-input")&&!document.querySelector(".pane-input").disabled'
    );
    await wait(
      'document.querySelector("iframe.composer-extension-frame")?.contentDocument?.querySelector("#mic")'
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    await type('手入力は維持');
    if (mode === 'prefixed') {
      await click('.pane-voice-btn');
      await wait('window.__speechSessions.length===1');
      await result([['旧APIも動作', true]]);
      await wait('document.querySelector(".pane-input").value.endsWith("旧APIも動作")');
      await evaluate('window.__speechSessions.at(-1).end()');
    } else {
      assert.equal(await evaluate('document.querySelector(".pane-voice-btn").disabled'), true);
      assert.equal(await evaluate('document.querySelector(".pane-input").value'), '手入力は維持');
      if (mode === 'insecure') {
        assert.equal(
          await evaluate(
            'document.querySelector(".composer-extension-status")?.textContent.includes("TailscaleのHTTPS")'
          ),
          true
        );
      }
    }
  }
  assert.equal(
    preview.requests.some((req) => req.method === 'POST'),
    false,
    'no agent requests or automatic sends'
  );
  await send('Page.navigate', { url: preview.url });
  await wait(
    'document.querySelector("iframe.composer-extension-frame")?.contentDocument?.querySelector("#mic")&&!document.querySelector(".pane-voice-btn").disabled'
  );
  await click('.pane-voice-btn');
  await wait('document.querySelector(".pane-send").disabled');
  await evaluate('window.__disableExtension()');
  await wait('!document.querySelector("iframe.composer-extension-frame")');
  await type('拡張停止後も手入力');
  await wait('!document.querySelector(".pane-send").disabled');
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        ok: true,
        checks: [
          'real ChatPane with managed extension iframe',
          'host capability compatibility check',
          'message source/origin/context/request/revision validation',
          'extension removal restores ordinary input',
          'Japanese recognition settings',
          'no textarea focus',
          'interim and final results',
          'duplicate finals',
          'expanding cumulative finals replace instead of append',
          'revised final at the same index',
          'intentional repeated words preserved',
          'manual editing cancels recording',
          'manual edits retained',
          'stop final results',
          'send blocked while recording',
          'permission denial',
          'late results after session change',
          'background cancellation',
          'prefixed API',
          'unsupported and insecure fallback',
          'mobile width',
          'no browser exceptions',
        ],
        output,
      },
      null,
      2
    )
  );
} finally {
  ws?.close();
  chrome.kill();
  await preview.close();
}
