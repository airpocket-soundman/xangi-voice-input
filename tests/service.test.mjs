import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {test} from 'node:test';

test('authenticated assets, managed ready event, no audio endpoint, clean stdin shutdown', {timeout:15000}, async()=>{
  const child=spawn(process.execPath,[fileURLToPath(new URL('../src/extension.mjs',import.meta.url)),'serve','--workspace',process.cwd()],{
    env:{...process.env,XANGI_EXTENSION_AUTH_TOKEN:'test-voice-only'},windowsHide:true,stdio:['pipe','pipe','pipe'],
  });
  const exit=once(child,'exit');
  try {
    const ready=JSON.parse(String((await once(child.stdout,'data'))[0]));
    assert.equal(ready.schemaVersion,2);assert.equal(ready.event,'ready');assert.equal(ready.id,'xangi-voice-input');
    const get=(path,token='test-voice-only',method='GET')=>fetch(ready.baseUrl+path,{method,headers:{authorization:`Bearer ${token}`}});
    assert.equal((await get('/health','wrong')).status,401);
    assert.equal((await get('/health')).status,200);
    const widget=await get('/composer/');assert.equal(widget.status,200);
    assert(widget.headers.get('content-security-policy').includes("frame-ancestors 'self'"));
    assert((await widget.text()).includes('id="mic"'));
    assert.equal((await get('/composer/voice.js')).status,200);
    assert.equal((await get('/api/audio')).status,404);
    assert.equal((await get('/composer/','test-voice-only','POST')).status,405);
  }finally{child.stdin.end()}
  assert.equal((await exit)[0],0);
});
