// Browser smoke check for the Ask AI page. Uses only local demo data and never
// contacts an external AI provider.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

process.env.MONGO_URI = '';
process.env.OPENAI_API_KEY = '';
const app = require('../server');
const browserPath = process.env.FRONTEND_AUDIT_BROWSER || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
].find((candidate) => fs.existsSync(candidate));
assert.ok(browserPath, 'Set FRONTEND_AUDIT_BROWSER to Chrome or Edge.');

class CDP {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve);
      this.socket.addEventListener('error', reject);
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
      } else {
        for (const listener of this.listeners.get(message.method) || []) listener(message.params);
      }
    });
  }

  on(method, listener) {
    this.listeners.set(method, [...(this.listeners.get(method) || []), listener]);
  }

  async send(method, params = {}) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Chrome DevTools timed out: ${method}`));
      }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }

  close() { this.socket.close(); }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  await app.ensureReady();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const profile = path.join(os.tmpdir(), `ask-ai-browser-${process.pid}`);
  const browser = spawn(browserPath, [
    '--headless=new', '--remote-debugging-port=0', '--remote-allow-origins=*',
    `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-component-update', '--disable-sync',
    '--disable-extensions', '--disable-gpu', 'about:blank'
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let client;
  let providerRequests = 0;
  try {
    const endpoint = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Chrome did not start within 20 seconds.')), 20000);
      browser.once('error', (error) => { clearTimeout(timeout); reject(error); });
      browser.stderr.on('data', (chunk) => {
        const match = chunk.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) { clearTimeout(timeout); resolve(match[1]); }
      });
    });
    const debug = new URL(endpoint);
    const target = await fetch(`http://${debug.host}/json/new?about:blank`, { method: 'PUT' }).then((response) => response.json());
    client = new CDP(target.webSocketDebuggerUrl);
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    client.on('Fetch.requestPaused', ({ requestId, request, resourceType }) => {
      const local = request.url.startsWith(origin) || /^(data:|about:)/.test(request.url);
      if (request.url.startsWith('https://api.openai.com/')) providerRequests += 1;
      const command = local
        ? client.send('Fetch.continueRequest', { requestId })
        : client.send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: resourceType === 'Stylesheet' ? 'text/css' : 'application/javascript' }], body: '' });
      command.catch(() => {});
    });
    const exceptions = [];
    client.on('Runtime.exceptionThrown', ({ exceptionDetails }) => exceptions.push(exceptionDetails.exception?.description || exceptionDetails.text));

    const viewports = [
      { label: 'desktop', width: 1366, height: 900, mobile: false },
      { label: 'tablet', width: 768, height: 1024, mobile: true },
      { label: 'phone', width: 390, height: 844, mobile: true }
    ];
    for (const viewport of viewports) {
      await client.send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile });
      await client.send('Page.navigate', { url: `${origin}/pages/ask-ai.html` });
      let ready = false;
      for (let index = 0; index < 100; index += 1) {
        await wait(50);
        ready = await client.evaluate("document.readyState==='complete' && !!document.querySelector('#askAiInput') && !!document.querySelector('.nav-link[data-nav=askai]')").catch(() => false);
        if (ready) break;
      }
      assert.ok(ready, `${viewport.label}: Ask AI page and navigation should load`);
      const layout = await client.evaluate('({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,card:!!document.querySelector(".ask-ai-card")})');
      assert.ok(layout.card, `${viewport.label}: chat card should render`);
      assert.ok(layout.scrollWidth <= viewport.width, `${viewport.label}: horizontal overflow (${layout.scrollWidth}px)`);
    }

    const initialUsers = await client.evaluate("document.querySelectorAll('.user-message').length");
    await client.evaluate("document.getElementById('askAiInput').value='Which clubs can I join?'; document.getElementById('askAiInput').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true,cancelable:true}));");
    assert.equal(await client.evaluate("document.querySelectorAll('.user-message').length"), initialUsers, 'Shift+Enter must not send');
    await client.evaluate("document.getElementById('askAiInput').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));");
    let responded = false;
    for (let index = 0; index < 100; index += 1) {
      await wait(75);
      responded = await client.evaluate("document.querySelectorAll('.assistant-message .message-meta').length>0 && !document.querySelector('.ask-ai-typing')").catch(() => false);
      if (responded) break;
    }
    assert.ok(responded, 'Fallback should answer the submitted question');
    const chat = await client.evaluate("({users:document.querySelectorAll('.user-message').length,answer:[...document.querySelectorAll('.assistant-message')].find((item)=>item.querySelector('.message-meta'))?.querySelector('.message-body')?.innerText||'',sources:document.querySelectorAll('.message-sources a').length,mode:document.querySelector('#askAiMode')?.textContent})");
    assert.equal(chat.users, 1);
    assert.ok(/website data answer/i.test(chat.answer), JSON.stringify(chat));
    assert.ok(chat.sources > 0, JSON.stringify(chat));
    assert.ok(chat.mode.includes('Website data mode'));
    await client.evaluate("document.getElementById('clearChatButton').click()");
    assert.equal(await client.evaluate("document.querySelectorAll('.user-message').length"), 0, 'New chat must clear messages');
    assert.equal(await client.evaluate("document.getElementById('askAiSuggestions').hidden"), false, 'New chat must restore suggestions');
    assert.equal(providerRequests, 0, 'No request should reach the external AI provider');
    assert.equal(exceptions.length, 0, `Browser exceptions: ${exceptions.join('; ')}`);
    console.log('Ask AI browser smoke passed at 1366×900, 768×1024, and 390×844; keyboard behavior, fallback sources, reset, and browser errors checked.');
  } finally {
    client?.close();
    if (browser.exitCode === null) {
      await new Promise((resolve) => { browser.once('exit', resolve); browser.kill(); });
    }
    await new Promise((resolve) => server.close(resolve));
    const tempRoot = path.resolve(os.tmpdir()) + path.sep;
    const targetProfile = path.resolve(profile);
    if (targetProfile.startsWith(tempRoot) && path.basename(targetProfile) === `ask-ai-browser-${process.pid}`) {
      fs.rmSync(targetProfile, { recursive: true, force: true });
    }
  }
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
