const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {attendanceStore}=require('./helpers/attendance-store.cjs');
const {createReverseAttendance}=require('../services/reverse-attendance');
const {registerReverseAttendance}=require('../services/reverse-attendance-routes');
const {handleUniversityRegistration}=require('../services/university-event-registration');
const {registerStudentEvents}=require('../services/student-event-registration');
const {localInstant}=require('../services/event-attendance-context');
async function fixture(t){
  const students=['a','b','c'].map((name,i)=>({_id:String(i+1).repeat(24),name,email:name+'@example.test',universityId:'000'+i}));
  const event={requestId:99,title:'Concurrency event',date:'2099-10-19',time:'12:00',attendanceEnabled:true,registrationEnabled:true,capacity:1,cancellationEnabled:true};
  const store=attendanceStore({StudentAccount:students,Club:[{id:1,archivedAt:null,events:[event],memberRoster:[]}],UniversityContent:[{...event,id:9,type:'event',attendanceSettings:{registrationCapacity:1}}]});
  const app=express();app.use(express.json());let ready=true;
  const requireStudentAuth=(req,res,next)=>{const s=students.find(s=>s.name===req.headers['x-account']);if(!s)return res.status(401).json({message:'Sign in'});req.studentAccount=s;next();};
  const service=createReverseAttendance({...store.models,database:store.database,secret:'api-test-secret-with-more-than-thirty-two-chars',clock:()=>localInstant(event.date,'11:50'),deviceHash:req=>req.headers['x-device']||req.headers['x-account']});
  const sameOrigin=req=>req.headers.origin!=='https://untrusted.test';
  registerReverseAttendance(app,{...store.models,service,requireStudentAuth,ready:()=>ready,sameOrigin,actorFor:async req=>req.headers['x-admin']==='true'?{admin:true,email:'admin@example.test'}:students.find(s=>s.name===req.headers['x-account'])});
  registerStudentEvents(app,{...store.models,mongoose:store.database,requireStudentAuth,sameOrigin,databaseReady:()=>ready});
  for(const method of ['get','post','delete'])app[method]('/api/university-content/:id/registrations',requireStudentAuth,(req,res)=>handleUniversityRegistration(req,res,{...store.models,database:store.database,sameOrigin}));
  const server=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});t.after(()=>new Promise(resolve=>server.close(resolve)));
  async function request(path,method='GET',body,headers={}){const response=await fetch('http://127.0.0.1:'+server.address().port+path,{method,headers:{'Content-Type':'application/json','x-account':'a',...headers},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};}
  return {store,request,setReady:value=>ready=value};
}
for(const source of ['club','miu'])test(source+': last place cannot be overbooked; duplicate consumes no place; cancellation reopens and lowering capacity preserves history',async t=>{
  const f=await fixture(t),path=source==='club'?'/api/events/1/0/registrations':'/api/university-content/9/registrations';
  const results=await Promise.all(['a','b'].map(name=>f.request(path,'POST',{}, {'x-account':name})));assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
  const winner=results[0].status===201?'a':'b',loser=winner==='a'?'b':'a';assert.equal((await f.request(path,'POST',{}, {'x-account':winner})).data.alreadyRegistered,true);
  const full=await f.request(path,'GET',null,{'x-account':loser});assert.equal(full.data.full,true);assert.equal(full.data.message,'Full Capacity');assert.equal(f.store.rows.EventRegistration.length,1);
  assert.equal((await f.request(path,'DELETE',{}, {'x-account':winner})).status,200);assert.equal((await f.request(path,'POST',{}, {'x-account':loser})).status,201);
  const base='/api/reverse-attendance/'+(source==='club'?'club/1/0':'miu/0/9');
  assert.equal((await f.request(base+'/settings','PUT',{capacity:0},{'x-admin':'true'})).data.savedToDatabase,true);assert.equal(f.store.rows.EventRegistration.length,1);assert.equal((await f.request(path,'POST',{}, {'x-account':'c'})).status,409);
});
test('real HTTP route auth, CSRF, scope, validation and failures never return an unconfirmed success',async t=>{
  const f=await fixture(t),base='/api/reverse-attendance/club/1/0';
  assert.equal((await f.request(base+'/qr','GET',null,{'x-account':''})).status,401);
  assert.equal((await f.request(base+'/scan','POST',{token:'forged'})).status,403);
  assert.equal((await f.request(base+'/settings','PUT',{capacity:1})).status,403);
  assert.equal((await f.request(base+'/settings','PUT',{capacity:1},{'x-admin':'true',origin:'https://untrusted.test'})).status,403);
  assert.equal((await f.request(base+'/scan','POST',{token:'forged'},{'x-admin':'true'})).data.code,'INVALID_QR');
  await f.request('/api/events/1/0/registrations','POST',{});
  const myEvents=(await f.request('/api/reverse-attendance/my-events')).data.items;assert.equal(myEvents.length,1);assert.equal(myEvents[0].time,'12:00');
  assert.equal((await f.request(base,'GET',null,{'x-admin':'true'})).data.time,'12:00');
  assert.equal((await f.request('/api/reverse-attendance/managed-events')).data.items.length,0);
  const managed=(await f.request('/api/reverse-attendance/managed-events','GET',null,{'x-admin':'true'})).data.items;assert.equal(managed.length,2);assert.ok(managed.every(item=>item.time==='12:00'));
  const qr=await f.request(base+'/qr');f.store.faults.commit=true;
  const result=await f.request(base+'/scan','POST',{token:qr.data.token},{'x-admin':'true'});assert.equal(result.status,503);assert.equal(result.data.savedToDatabase,false);assert.equal(result.data.color,'red');assert.equal(f.store.rows.AttendanceRecord.length,0);
  f.setReady(false);assert.equal((await f.request(base+'/qr')).status,503);
});
test('legacy events require a stable identity migration, preserving unrelated event records',async()=>{
  const {migrateLegacyEvents}=require('../services/attendance-legacy-migration');
  const store=attendanceStore({Club:[{id:1,events:[{title:'Legacy',date:'2099-10-19'}]}],AttendanceRecord:[{_id:'record',clubId:1,itemType:'event',eventRequestId:-1,eventTitle:'Legacy',eventDate:'2099-10-19',attendedAt:new Date(100)}],EventRegistration:[{_id:'registration',clubId:1,eventIndex:0,eventTitle:'Legacy',email:'x@example.test'}]});
  assert.equal(await migrateLegacyEvents(store.models,store.database),1);const id=store.rows.Club[0].events[0].requestId;assert.ok(Number.isSafeInteger(id)&&id>0);assert.equal(store.rows.AttendanceRecord[0].eventRequestId,id);assert.equal(store.rows.AttendanceRecord[0].attendedAt.getTime(),100);assert.equal(store.rows.EventRegistration[0].eventRequestId,id);assert.equal(await migrateLegacyEvents(store.models,store.database),0);
  const ambiguous=attendanceStore({Club:[{id:1,events:[{title:'Replacement',date:'2099-10-19'}]}],AttendanceRecord:[{clubId:1,itemType:'event',eventRequestId:-1,eventTitle:'Old',eventDate:'2099-10-19'}]});await assert.rejects(migrateLegacyEvents(ambiguous.models,ambiguous.database),/Ambiguous/);assert.equal(ambiguous.rows.Club[0].events[0].requestId,undefined);assert.equal(ambiguous.rows.AttendanceRecord[0].eventRequestId,-1);
});
