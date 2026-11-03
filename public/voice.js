const button = document.querySelector('#mic');
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const unavailable = !window.isSecureContext
  ? '音声入力はTailscaleのHTTPSアドレスから利用してください。このHTTP接続では通常の文字入力を使えます。'
  : !Recognition
    ? 'このブラウザでは音声入力を利用できません。'
    : '';
let configuration, session;
const post = (message) =>
  parent.postMessage(
    { schemaVersion: 1, contextId: configuration?.contextId, ...message },
    location.origin
  );
const render = () => {
  button.disabled = !configuration || configuration.disabled || Boolean(unavailable);
  button.setAttribute('aria-pressed', String(Boolean(session)));
  button.setAttribute('aria-label', session ? '音声入力を停止' : '音声入力を開始');
  button.title = unavailable || (session ? '音声入力を停止' : '音声入力を開始');
};
function detach(s) {
  clearTimeout(s.timeout);
  s.recognition.onstart =
    s.recognition.onend =
    s.recognition.onerror =
    s.recognition.onresult =
      null;
}
function cancel() {
  const s = session;
  session = undefined;
  if (s) {
    detach(s);
    try {
      s.recognition.abort();
    } catch {
      /* Already ended. */
    }
  }
  render();
}
function end(s, error = '') {
  if (session !== s) return;
  session = undefined;
  detach(s);
  post({ type: 'xangi.composer.end', requestId: s.requestId, error });
  render();
}
const errors = {
  'not-allowed': 'マイクの使用が許可されていません。ブラウザのサイト設定を確認してください。',
  'service-not-allowed': '音声認識の使用が許可されていません。',
  'audio-capture': 'マイクを使用できません。接続を確認してください。',
  'no-speech': '音声を確認できませんでした。もう一度マイクを押してください。',
  network: '音声認識サービスへ接続できません。ネットワークを確認してください。',
};
window.addEventListener('message', (event) => {
  const m = event.data;
  if (
    event.source !== parent ||
    event.origin !== location.origin ||
    m?.schemaVersion !== 1 ||
    m.type !== 'xangi.composer.configure' ||
    typeof m.contextId !== 'string' ||
    typeof m.disabled !== 'boolean'
  )
    return;
  if (configuration?.contextId !== m.contextId || m.disabled) cancel();
  configuration = m;
  render();
  post({ type: 'xangi.composer.availability', message: unavailable });
});
button.addEventListener('click', () => {
  if (!configuration || configuration.disabled || unavailable) return;
  if (session) {
    const s = session;
    if (s.stopping) return;
    s.stopping = true;
    post({
      type: 'xangi.composer.status',
      requestId: s.requestId,
      message: '音声を確定しています…',
    });
    try {
      s.recognition.stop();
      if (session === s)
        s.timeout = setTimeout(() => {
          if (session === s) {
            end(s);
            try {
              s.recognition.abort();
            } catch {
              /* Ended. */
            }
          }
        }, 5000);
    } catch {
      end(s);
      try {
        s.recognition.abort();
      } catch {
        /* Ended. */
      }
    }
    return;
  }
  let recognition;
  try {
    recognition = new Recognition();
  } catch {
    post({
      type: 'xangi.composer.availability',
      message: 'この環境では音声認識を開始できません。',
    });
    return;
  }
  const s = {
    recognition,
    requestId: crypto.randomUUID(),
    contextId: configuration.contextId,
    revision: 0,
    text: '',
  };
  session = s;
  const current = () =>
    session === s && configuration?.contextId === s.contextId && !configuration.disabled;
  recognition.lang = 'ja-JP';
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.onresult = (event) => {
    if (!current()) return;
    let final = '',
      interim = '';
    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) final = result[0]?.transcript || '';
      else interim = result[0]?.transcript || '';
    }
    // Mobile engines can emit expanding final snapshots. Replace, never append them.
    if (final.trim() && final !== s.text) {
      s.text = final;
      post({
        type: 'xangi.composer.update',
        requestId: s.requestId,
        revision: ++s.revision,
        text: final,
      });
    }
    post({
      type: 'xangi.composer.status',
      requestId: s.requestId,
      message: interim.slice(0, 950) || '聞き取り中…',
    });
  };
  recognition.onend = () => end(s);
  recognition.onerror = (event) => {
    if (!current()) return;
    end(
      s,
      event.error === 'aborted' ? '' : errors[event.error] || '音声認識を続けられませんでした。'
    );
    try {
      recognition.abort();
    } catch {
      /* Ended. */
    }
  };
  post({ type: 'xangi.composer.begin', requestId: s.requestId });
  post({ type: 'xangi.composer.status', requestId: s.requestId, message: '聞き取り中…' });
  render();
  // Keep the native start within the direct user gesture, including on mobile.
  try {
    recognition.start();
  } catch {
    end(s, '音声認識を開始できませんでした。');
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && session) {
    const s = session;
    end(s);
    try {
      s.recognition.abort();
    } catch {
      /* Ended. */
    }
  }
});
window.addEventListener('pagehide', cancel);
post({ type: 'xangi.composer.ready' });
