// Real frontend + production attendance services, synthetic transactional store.
// Never imports server.js, reads .env, or connects to an application database.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),express=require('express');
const CDP=require('./question-cdp.cjs'),{attendanceStore}=require('../helpers/attendance-store.cjs');
const {createReverseAttendance}=require('../../services/reverse-attendance'),{registerReverseAttendance}=require('../../services/reverse-attendance-routes'),{localInstant}=require('../../services/event-attendance-context');
const root=path.resolve(__dirname,'../..'),output=path.join(root,'.frontend-audit/reverse-attendance');fs.mkdirSync(output,{recursive:true});
const generator=path.join(output,'qrcode.min.js');assert.ok(fs.existsSync(generator),'Cache the existing pinned qrcodejs@1.0.0 generator in .frontend-audit/reverse-attendance/qrcode.min.js first.');
const students=['a','b','c'].map((name,i)=>({_id:String(i+1).repeat(24),name:'Browser Student '+name,email:name+'@example.test',universityId:'000'+i}));
const event={title:'Browser test event',requestId:99,date:'2026-10-19',time:'12:00',attendanceEnabled:true,capacity:3};
const store=attendanceStore({Club:[{id:1,archivedAt:null,events:[event],memberRoster:[]}],StudentAccount:students,EventRegistration:students.map(s=>({clubId:1,eventIndex:0,eventRequestId:99,email:s.email}))});
let activeStudent=students[0],admin=true;const start=Date.now(),base=localInstant(event.date,'11:50');
const service=createReverseAttendance({...store.models,database:store.database,secret:'browser-fixture-secret-over-thirty-two-characters',clock:()=>base+Date.now()-start,deviceHash:req=>req.device||'browser'});
const app=express();app.use(express.json());const testAdmin={admin:true,email:'browser-admin@example.test',role:'admin'};
registerReverseAttendance(app,{...store.models,service,requireStudentAuth:(req,res,next)=>{req.studentAccount=activeStudent;next();},actorFor:async()=>admin?testAdmin:activeStudent,ready:()=>true,sameOrigin:()=>true});
app.get('/assets/vendor/jsQR.js',(req,res)=>res.sendFile(require.resolve('jsqr/dist/jsQR.js')));
app.get('/__test/qrcode.js',(req,res)=>res.sendFile(generator));
app.get('/api/site/account-session',(req,res)=>res.json({authenticated:true,type:'student',hasStudentDashboard:true,name:activeStudent.name,email:activeStudent.email,dashboards:[]}));
app.get('/api/site/public-data-stream',(req,res)=>{res.setHeader('Content-Type','text/event-stream');res.write('event: ready\ndata: {}\n\n');});
app.get('/api/student-auth/profile',(req,res)=>res.json(activeStudent));
app.get('/api/miu-attendance-task',(req,res)=>res.json({task:null}));
app.get('/api/site/account-photo',(req,res)=>res.json({photo:null}));
app.use('/api',(req,res)=>res.json({items:[],notifications:[],authenticated:false,available:false}));
app.use(express.static(path.join(root,'public')));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const origin='http://127.0.0.1:'+server.address().port;
  const browserPath=process.env.FRONTEND_AUDIT_BROWSER||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);assert.ok(browserPath);
  const browser=spawn(browserPath,['--headless=new','--remote-debugging-port=0','--user-data-dir='+path.join(output,'profile-'+Date.now()),'--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-gpu','about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});let cdp;
  try{
    const endpoint=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Chrome startup timed out')),20000);browser.once('error',reject);browser.stderr.on('data',chunk=>{const match=String(chunk).match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timeout);resolve(match[1]);}});});
    const target=await fetch('http://'+new URL(endpoint).host+'/json/new?about:blank',{method:'PUT'}).then(r=>r.json());cdp=new CDP(target.webSocketDebuggerUrl);await cdp.send('Page.enable');await cdp.send('Runtime.enable');await cdp.send('Network.enable');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`(() => { const append = Element.prototype.append; Element.prototype.append = function(...nodes) { for (const node of nodes) if(node.tagName==='SCRIPT' && node.src.includes('qrcodejs@1.0.0')) node.src='/__test/qrcode.js'; return append.apply(this,nodes); }; })();`});
    const evaluate=async expression=>{const result=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
    const until=async expression=>{const deadline=Date.now()+10000;while(Date.now()<deadline){if(await evaluate(expression))return;await delay(60);}throw new Error('Browser condition timed out: '+expression+' status='+await evaluate("document.querySelector('[data-ra-status]')?.textContent"));};
    const navigate=async page=>{await cdp.send('Page.navigate',{url:origin+page});await until("document.querySelector('[data-ra-event]')?.options.length && !document.querySelector('[data-ra-event]').options[0].textContent.includes('Loading')");};
    const screenshot=async name=>{const data=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(data.data,'base64'));};
    const submit=async token=>{await evaluate(`(()=>{const f=document.querySelector('[data-ra-manual]');f.elements.token.value=${JSON.stringify(token)};f.requestSubmit();})()`);};
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await navigate('/pages/attendance-qr.html');await until("document.querySelector('[data-ra-qr] canvas')");assert.equal(store.rows.AttendanceRecord.length,0);
    const decode=async()=>evaluate(`(async()=>{await new Promise((resolve,reject)=>{if(window.jsQR)return resolve();const s=document.createElement('script');s.src='/assets/vendor/jsQR.js';s.onload=resolve;s.onerror=reject;document.head.append(s);});const c=document.querySelector('[data-ra-qr] canvas'),p=c.getContext('2d').getImageData(0,0,c.width,c.height);return window.jsQR(p.data,p.width,p.height).data;})()`);
    const first=await decode();assert.ok(first.startsWith('ra1.'));assert.equal(first.includes(activeStudent.email),false);await screenshot('student-mobile-light');
    await evaluate("document.documentElement.dataset.theme='dark'");await screenshot('student-mobile-dark');assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
    await delay(20500);await until("document.querySelector('[data-ra-qr] canvas')");assert.notEqual(await decode(),first);assert.equal(store.rows.DeviceBinding.length,1);assert.equal(store.rows.AttendanceRecord.length,0);
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false});
    await navigate('/pages/attendance-scanner.html');await until("document.querySelector('[data-ra-details]').textContent.includes('0 attended')");
    await evaluate("navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Denied','NotAllowedError')};document.querySelector('[data-ra-camera]').click()");await until("document.querySelector('[data-ra-status]').textContent.includes('permission was denied')");
    await submit(first);await until("document.querySelector('[data-ra-result]').textContent.includes('expired')");assert.equal(store.rows.AttendanceRecord.length,0);
    const qr=await service.issue({source:'club',clubId:1,eventIndex:0},activeStudent,{device:'browser'},{});
    // A real canvas MediaStream feeds a real QR image into the production jsQR camera loop.
    await evaluate(`(async()=>{await window.ensureQRCode();const holder=document.createElement('div');holder.hidden=true;document.body.append(holder);new QRCode(holder,{text:${JSON.stringify(qr.token)},width:400,height:400,correctLevel:QRCode.CorrectLevel.M});const qrCanvas=holder.querySelector('canvas'),canvas=document.createElement('canvas');canvas.width=500;canvas.height=500;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,500,500);ctx.drawImage(qrCanvas,50,50);window.__cameraStream=canvas.captureStream(5);window.BarcodeDetector=undefined;navigator.mediaDevices.getUserMedia=async()=>window.__cameraStream;document.querySelector('[data-ra-next]').click();document.querySelector('[data-ra-camera]').click();})()`);
    await until("document.querySelector('[data-ra-result]').dataset.color==='green'");assert.equal(store.rows.AttendanceRecord.length,1);await screenshot('scanner-desktop-green');
    await submit(qr.token);await until("document.querySelector('[data-ra-result]').textContent.includes('Already checked in')");assert.equal(store.rows.AttendanceRecord.length,1);
    activeStudent=students[1];const switched=await service.issue({source:'club',clubId:1,eventIndex:0},activeStudent,{device:'browser'},{});await submit(switched.token);await until("!document.querySelector('[data-ra-verify]').hidden");assert.equal(await evaluate("document.querySelector('[data-ra-result]').dataset.color"),'yellow');assert.equal(store.rows.AttendanceRecord.length,1);await screenshot('scanner-desktop-yellow');
    await evaluate("document.querySelector('[data-ra-verify]').requestSubmit()");assert.equal(store.rows.AttendanceRecord.length,1);
    await evaluate("(()=>{const form=document.querySelector('[data-ra-verify]');form.elements.verified.checked=true;form.elements.note.value='University card reviewed in browser test';form.requestSubmit();})()");await until("document.querySelector('[data-ra-result]').dataset.color==='green'");assert.equal(store.rows.AttendanceRecord.length,2);
    await evaluate("document.querySelector('[data-ra-close]').click()");assert.equal(await evaluate("window.__cameraStream.getTracks().every(track=>track.readyState==='ended')"),true);
    activeStudent=students[2];const finalQr=await service.issue({source:'club',clubId:1,eventIndex:0},activeStudent,{device:'separate-browser'},{});store.faults.commit=true;await submit(finalQr.token);await until("document.querySelector('[data-ra-result]').textContent.includes('could not be confirmed')");assert.equal(store.rows.AttendanceRecord.length,2);store.faults.commit=false;
    for(const theme of ['light','dark'])for(const width of [390,320]){await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});await evaluate(`document.documentElement.dataset.theme='${theme}'`);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);await screenshot('scanner-'+width+'-'+theme);}
    const exceptions=cdp.events.filter(event=>event.method==='Runtime.exceptionThrown');assert.deepEqual(exceptions,[]);
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({passed:true,qrActuallyDecoded:true,refresh20Seconds:true,camera:'Synthetic canvas MediaStream decoded with production jsQR',physicalCameraTested:false,cameraDenial:true,green:true,duplicateRed:true,sharedDeviceYellow:true,verifiedGreen:true,commitFailureRed:true,streamsReleased:true,viewports:[320,390,1366],themes:['light','dark'],exceptions:0},null,2));
    console.log('Browser attendance passed: real QR render/decode/20s refresh; camera denial and canvas-stream scanning; green/red/yellow verification; commit failure; camera cleanup; 320/390/1366 light/dark. Physical hardware remains untested.');
  }finally{cdp?.socket.close();browser.kill();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
