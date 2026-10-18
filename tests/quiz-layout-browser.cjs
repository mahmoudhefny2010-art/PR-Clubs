const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const browserPath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/assets/css/base.css"><link rel="stylesheet" href="/assets/css/features.css"><link rel="stylesheet" href="/assets/css/modal-controls.css">' + ['quiz-clubs', 'quiz-questions', 'quiz-scoring', 'quiz-ui'].map(name => `<script defer src="/assets/js/${name}.js"></script>`).join('') + '<body></body>');
    return;
  }
  const file = path.resolve(root, 'public', '.' + req.url);
  if (!file.startsWith(path.join(root, 'public') + path.sep) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : 'application/javascript');
  res.end(fs.readFileSync(file));
});
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const profile = fs.mkdtempSync(path.join(root, '.tmp-quiz-layout-'));
  const browser = spawn(browserPath, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let socket;
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Browser startup timeout')), 15000);
      browser.once('error', error => { clearTimeout(timer); reject(error); });
      browser.stderr.on('data', chunk => { output += chunk; const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
    });
    const targets = await (await fetch(endpoint.replace('ws:', 'http:').replace(/\/devtools\/browser\/.*/, '/json'))).json();
    socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
    let id = 0;
    const pending = new Map();
    socket.addEventListener('message', event => { const message = JSON.parse(event.data); if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); } });
    const send = (method, params = {}) => new Promise((resolve, reject) => { const current = ++id; const timer = setTimeout(() => { pending.delete(current); reject(new Error('Timeout: ' + method)); }, 10000); pending.set(current, message => { clearTimeout(timer); message.error ? reject(new Error(message.error.message)) : resolve(message.result); }); socket.send(JSON.stringify({ id: current, method, params })); });
    const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
    await send('Page.enable');
    await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
    await evaluate('new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error("Quiz failed to initialize")), 5000); const check = () => { if(window.MiuQuizInitialized) { clearTimeout(timer); resolve(true); } else setTimeout(check, 20); }; check(); })');
    await evaluate('document.querySelector(".quiz-launcher-circle").click()');
    for (const [width, height] of [[1280, 800], [940, 560], [390, 700], [360, 520]]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      for (const theme of ['light', 'dark']) {
        const result = await evaluate(`(async () => {
          document.documentElement.dataset.theme = '${theme}';
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const dialog = document.querySelector('.quiz-dialog'), panel = document.querySelector('.quiz-panel'), close = document.querySelector('.quiz-dialog-close');
          const bounds = dialog.getBoundingClientRect(), buttons = [...document.querySelectorAll('.quiz-actions button')];
          return { closePosition: getComputedStyle(close).position, panelFits: panel.getBoundingClientRect().bottom <= bounds.bottom, buttonsVisible: buttons.length > 0 && buttons.every(button => { const r = button.getBoundingClientRect(); return r.top >= bounds.top && r.bottom <= bounds.bottom && r.left >= bounds.left && r.right <= bounds.right; }) };
        })()`);
        assert.equal(result.closePosition, 'absolute', `${width}x${height} ${theme}: close position`);
        assert.equal(result.panelFits, true, `${width}x${height} ${theme}: panel fits`);
        assert.equal(result.buttonsVisible, true, `${width}x${height} ${theme}: buttons visible`);
      }
    }
    console.log('Quiz layout passed: footer buttons fit at 4 viewport sizes in both themes.');
  } finally {
    socket?.close();
    browser.kill();
    server.close();
  }
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
