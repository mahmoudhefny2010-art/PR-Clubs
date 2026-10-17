const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),express=require('express'),{spawn}=require('child_process'),CDP=require('./question-cdp.cjs');
const root=path.resolve(__dirname,'../..'),output=path.join(root,'.frontend-audit/staff-invites');fs.mkdirSync(output,{recursive:true});const app=express();app.use(express.json());let writes=[];
app.get('/api/supervisor/clubs',(_req,res)=>res.json({clubs:[]}));
app.get('/api/supervisor/speaker-invites/clubs',(_req,res)=>res.json([{id:0,name:'MIU'},{id:7,name:'Assigned club'}]));
app.post('/api/supervisor/speaker-invites',(req,res)=>{writes.push(req.body);res.json({url:'/speaker-intake.html?t=fixture',reused:false});});
app.get('/test',(_req,res)=>{let html=fs.readFileSync(path.join(root,'public/dashboards/supervisor-dashboard.html'),'utf8');html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, tag=>tag.includes('/assets/js/supervisor-')?tag:'');res.send(html);});
app.use(express.static(path.join(root,'public')));let browser,cdp;const server=app.listen(0,'127.0.0.1');const delay=ms=>new Promise(r=>setTimeout(r,ms));async function until(exp){for(let i=0;i<100;i++){try{if(await cdp.evaluate(exp))return;}catch{}await delay(50);}throw Error(exp);}
(async()=>{if(!server.listening)await new Promise(r=>server.once('listening',r));const origin='http://127.0.0.1:'+server.address().port;
  const executable = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
  browser = spawn(executable, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${path.join(output, 'profile-' + Date.now())}`, '--no-first-run', '--disable-background-networking', '--disable-extensions', '--disable-gpu', 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Browser startup timeout')), 15000);
    browser.on('error', reject); browser.stderr.on('data', data => { const match = String(data).match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
  });
  const pages = await (await fetch(new URL(endpoint).origin.replace('ws:', 'http:') + '/json/list')).json();
  cdp = new CDP(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });

await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:"window.MiuUI={escapeHtml:s=>String(s),createJsonClient:()=>async(url,options)=>{const r=await fetch(url,options);return r.json();}};window.ensureQRCode=async()=>{window.QRCode=function(el){el.append(document.createElement('canvas'));};window.QRCode.CorrectLevel={M:0};};"});
await cdp.send('Page.navigate',{url:origin+'/test'});await until("document.getElementById('deanSpeakerInviteClub')?.options.length===3");assert.equal(await cdp.evaluate("document.getElementById('deanSpeakerInvitePanel').hidden"),true);
await cdp.evaluate("document.querySelector('[data-panel=speakerInvite]').click();document.getElementById('deanSpeakerInviteClub').value='0';document.getElementById('deanGenerateSpeakerInvite').click()");await until("!document.getElementById('deanSpeakerInviteResult').hidden");assert.equal(writes[0].clubId,0);assert.equal(await cdp.evaluate("document.getElementById('supervisorContent').hidden"),true);
await cdp.evaluate("document.getElementById('deanRotateSpeakerInvite').click()");await until("!document.getElementById('deanRotateSpeakerInvite').disabled");assert.equal(writes[1].rotate,true);
await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(400);assert.equal(await cdp.evaluate("document.documentElement.scrollWidth<=innerWidth"),true,JSON.stringify(await cdp.evaluate("({w:innerWidth,scroll:document.documentElement.scrollWidth,items:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth).map(e=>[e.tagName,e.id,e.className,e.getBoundingClientRect().right]).slice(0,12)})")));
await cdp.evaluate("document.querySelector('[data-panel=overview]').click()");assert.equal(await cdp.evaluate("document.getElementById('deanSpeakerInvitePanel').hidden"),true);console.log('Supervisor invitation browser checks passed: MIU, generate, rotate, panel switching, mobile width.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{cdp?.socket.close();browser?.kill();server.close();});
