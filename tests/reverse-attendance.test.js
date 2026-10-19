const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {createReverseAttendance,createAttendanceCipher}=require('../services/reverse-attendance');
const {localInstant,attendanceWindow}=require('../services/event-attendance-context');
const {attendanceStore}=require('./helpers/attendance-store.cjs');
const secret='attendance-test-secret-over-thirty-two-characters';
const a={_id:'111111111111111111111111',email:'a@example.test',name:'Student A',universityId:'00123',major:'CS',sessionVersion:0};
const b={...a,_id:'222222222222222222222222',email:'b@example.test',name:'Student B',universityId:'00456'};
const admin={admin:true,role:'admin',email:'admin@example.test'},ref={source:'club',clubId:1,eventIndex:0},miu={source:'miu',clubId:0,eventIndex:9};
function fixture(){
  const event={title:'Event',date:'2026-10-19',time:'12:00',requestId:99,attendanceEnabled:true,registrationEnabled:true,capacity:1,attendanceSettings:{timeZone:'Africa/Cairo'}};
  let now=localInstant(event.date,'11:50');
  const store=attendanceStore({Club:[{_id:'club',id:1,archivedAt:null,events:[event,{...event,requestId:100}],memberRoster:[]}],UniversityContent:[{...event,_id:'miu',id:9,type:'event'}],StudentAccount:[a,b],EventRegistration:[a,b].flatMap(s=>[{clubId:1,eventIndex:0,eventRequestId:99,email:s.email},{clubId:0,eventIndex:9,eventRequestId:9,email:s.email}])});
  const deps={...store.models,database:store.database,secret,clock:()=>now,deviceHash:req=>req.device||'browser',isItHead:actor=>actor.committee==='IT'};
  const service=createReverseAttendance(deps);
  return {store,service,event,deps,setNow:value=>now=value,now:()=>now,issue:(s=a,r=ref,device='browser')=>service.issue(r,s,{device},{}),scan:(token,actor=admin,r=ref,extra={})=>service.scan(r,actor,{token,...extra},{},{})};
}
const code=expected=>error=>error.code===expected;
test('timezone windows use server time, open at exactly ten minutes, close at configured end, validate DST and dates',()=>{
  const event={date:'2026-10-19',time:'12:00',attendanceSettings:{timeZone:'Africa/Cairo',endTime:'13:00'}},start=localInstant(event.date,event.time);
  assert.equal(attendanceWindow(event,start-600001).state,'waiting');assert.equal(attendanceWindow(event,start-600000).state,'open');
  assert.equal(attendanceWindow(event,localInstant(event.date,'13:00')).state,'closed');
  assert.throws(()=>localInstant('2026-02-30','12:00'),code('SCHEDULE_REQUIRED'));assert.throws(()=>localInstant('2026-03-08','02:30','America/New_York'),code('SCHEDULE_REQUIRED'));
  assert.throws(()=>localInstant(event.date,event.time,'Invalid/Zone'),code('TIMEZONE_INVALID'));
  assert.equal(localInstant('2026-10-19','12:00','UTC'),Date.parse('2026-10-19T12:00:00Z'));
});
test('cipher encrypts identity and rejects tampering, wrong purpose, event, expiry, and foreign secret',()=>{
  let now=100000;const cipher=createAttendanceCipher(secret,()=>now),payload={account:a._id,purpose:'attendance',event:'club:1:99',iat:now,exp:now+20000};const token=cipher.seal(payload);
  assert.equal(token.includes(a._id),false);assert.deepEqual(cipher.open(token,'attendance',payload.event),payload);
  assert.throws(()=>cipher.open(token+'A','attendance',payload.event),code('INVALID_QR'));
  assert.throws(()=>cipher.open(token,'verify',payload.event),code('INVALID_QR'));assert.throws(()=>cipher.open(token,'attendance','miu:0:99'),code('WRONG_EVENT'));
  assert.throws(()=>createAttendanceCipher(secret+'x',()=>now).open(token,'attendance',payload.event),code('INVALID_QR'));
  now+=20000;assert.throws(()=>cipher.open(token,'attendance',payload.event),code('EXPIRED_QR'));
});
test('QR issue respects pre-window, refresh is stateless, account PK is persistent, and never marks attendance',async()=>{
  const f=fixture();f.setNow(f.now()-1);const early=await f.issue();assert.equal(early.available,false);assert.equal(f.store.rows.DeviceBinding.length,0);
  f.setNow(f.now()+1);const first=await f.issue();assert.equal(first.expiresAt-first.serverNow,20000);
  const next=await f.issue();assert.notEqual(first.token,next.token);assert.equal(f.store.rows.DeviceBinding.length,1);assert.equal(f.store.rows.StudentAccount.length,2);assert.equal(f.store.rows.StudentAccount[0]._id,a._id);assert.equal(f.store.rows.AttendanceRecord.length,0);
});
test('green only follows committed write; duplicate red preserves timestamp/count and ignores submitted identity',async()=>{
  const f=fixture(),qr=await f.issue();const result=await f.scan(qr.token,admin,ref,{account:b._id,name:'forged',email:b.email});
  assert.equal(result.color,'green');assert.equal(result.savedToDatabase,true);assert.equal(result.name,a.name);assert.equal(result.universityId,'00123');
  f.setNow(f.now()+100);const duplicate=await f.scan(qr.token);assert.equal(duplicate.color,'red');assert.equal(duplicate.savedToDatabase,false);assert.deepEqual(duplicate.attendedAt,result.attendedAt);assert.equal(f.store.rows.AttendanceRecord.length,1);
  const overview=await f.service.overview(ref,admin,{},{});assert.equal(overview.registrationCount,2);assert.equal(overview.attendanceCount,1);assert.equal((await f.issue()).attended,true);
});
test('two supervisors scanning concurrently create exactly one attendance and one scan audit',async()=>{
  const f=fixture(),qr=await f.issue();const results=await Promise.all([f.scan(qr.token),f.scan(qr.token,{...admin,email:'second@example.test'})]);
  assert.deepEqual(results.map(r=>r.color).sort(),['green','red']);assert.equal(f.store.rows.AttendanceRecord.length,1);assert.equal(f.store.rows.AuditLog.filter(r=>r.action==='attendance_scanned').length,1);
});
test('shared browser warns yellow, exposes no previous identity, requires scoped explicit card verification',async()=>{
  const f=fixture();const old=await f.issue();const qr=await f.issue(b);assert.equal(qr.deviceWarning,true);assert.equal(JSON.stringify(qr).includes(a.email),false);
  await assert.rejects(f.scan(old.token),code('REVOKED_QR'));
  const pending=await f.scan(qr.token);assert.equal(pending.color,'yellow');assert.equal(pending.savedToDatabase,false);assert.equal(f.store.rows.AttendanceRecord.length,0);assert.equal(JSON.stringify(pending).includes(a.email),false);
  await assert.rejects(f.scan('',admin,ref,{verificationToken:pending.verificationToken,verifiedIdentity:true,verificationNote:'x'}),code('VERIFICATION_REQUIRED'));
  await assert.rejects(f.scan('',{...admin,email:'other@example.test'},ref,{verificationToken:pending.verificationToken,verifiedIdentity:true,verificationNote:'Card verified'}),code('VERIFICATION_REQUIRED'));
  const accepted=await f.scan('',admin,ref,{verificationToken:pending.verificationToken,verifiedIdentity:true,verificationNote:'Card verified in person'});assert.equal(accepted.color,'green');assert.equal(f.store.rows.AttendanceRecord[0].reverseAttendance.verifiedSwitch,true);
});
test('device risk survives service restart/logout and other-device login preserves immutable account identity',async()=>{
  const f=fixture();await f.issue();await f.issue(b);const restarted=createReverseAttendance(f.deps);
  const switchedBack=await restarted.issue(ref,a,{device:'browser'},{});assert.equal(switchedBack.deviceWarning,true);
  const otherDevice=await f.issue(a,ref,'new-browser');assert.equal(otherDevice.deviceWarning,false);assert.equal(f.store.rows.StudentAccount[0]._id,a._id);
  f.setNow(f.now()+31*86400000);await restarted.bindDevice(a,{device:'browser'},{});assert.equal(f.store.rows.DeviceBinding.find(r=>r.deviceHash==='browser').state.switched,false);
});
test('cancelled registration, lost membership, revoked account, closed/cancelled event, and expiry never write',async()=>{
  for(const kind of ['registration','membership','session','deleted','closed','cancelled','expired','manual']){
    const f=fixture(),qr=await f.issue();
    if(kind==='registration')f.store.rows.EventRegistration.splice(0,f.store.rows.EventRegistration.length);
    if(kind==='membership')f.store.rows.Club[0].events[0].attendanceAudience='members';
    if(kind==='session')f.store.rows.StudentAccount[0].sessionVersion++;
    if(kind==='deleted')f.store.rows.StudentAccount.shift();
    if(kind==='closed')f.setNow(localInstant('2026-10-20','00:00'));
    if(kind==='cancelled')f.store.rows.Club[0].events[0].cancelled=true;
    if(kind==='expired')f.setNow(f.now()+20000);
    if(kind==='manual')f.store.rows.AttendanceActivityClosure.push({clubId:1,itemType:'event',eventRequestId:99});
    await assert.rejects(f.scan(qr.token));assert.equal(f.store.rows.AttendanceRecord.length,0,kind);
  }
});
test('different events including same-title club/university are isolated; student cannot self-submit',async()=>{
  const f=fixture(),qr=await f.issue();await assert.rejects(f.scan(qr.token,admin,miu),code('WRONG_EVENT'));
  f.store.rows.AttendanceSession.push({_id:'miu-lane',sourceType:'miu',clubId:0,itemType:'event',eventRequestId:9,active:true,assignedSupervisorEmail:'supervisor@example.test'});
  await assert.rejects(f.scan(qr.token,admin,{...ref,eventIndex:1}),code('WRONG_EVENT'));await assert.rejects(f.scan(qr.token,a),code('UNAUTHORIZED_SUPERVISOR'));
  const u=await f.issue(a,miu);assert.equal((await f.scan(u.token,admin,miu)).color,'green');assert.equal((await f.scan(qr.token)).color,'green');assert.equal(f.store.rows.AttendanceRecord.length,2);
});
test('capacity permissions follow actual role and ownership, supervisors and ordinary heads cannot configure',async()=>{
  const f=fixture();for(const actor of [a,{role:'president',clubId:2},{role:'head',clubId:1,committee:'Media'},{role:'supervisor',assignedClubIds:[1]},{role:'pr'}])await assert.rejects(f.service.configure(ref,actor,{capacity:3}),code('CAPACITY_FORBIDDEN'));
  for(const actor of [admin,{role:'president',clubId:1,email:'p'},{role:'head',clubId:1,committee:'IT',email:'it'}])assert.equal((await f.service.configure(ref,actor,{capacity:1})).savedToDatabase,true);
  const reduced=await f.service.configure(ref,admin,{capacity:0});assert.equal(reduced.full,true);assert.equal(f.store.rows.EventRegistration.length,4);assert.match(reduced.message,/preserved/);
  for(const capacity of [-1,1.5,'2',100001,undefined])await assert.rejects(f.service.configure(ref,admin,{capacity}),code('INVALID_CAPACITY'));
  assert.equal((await f.service.configure(miu,{role:'miu_events',email:'owner'}, {capacity:null})).capacity,null);
});
test('delegated scanner requires accepted assignment/device and cannot override warning; assigned supervisor is club scoped',async()=>{
  const f=fixture();f.store.rows.AttendanceAssignment.push({clubId:1,itemType:'event',eventRequestId:99,memberEmail:'usher@example.test',status:'accepted'});
  const delegated={email:'usher@example.test'},qr=await f.issue();assert.equal((await f.scan(qr.token,delegated)).color,'green');
  const next=await f.issue(b),warning=await f.scan(next.token,delegated);assert.equal(warning.color,'yellow');assert.equal(warning.canVerify,false);assert.equal(warning.verificationToken,undefined);
  await assert.rejects(f.scan(next.token,{role:'supervisor',assignedClubIds:[2],email:'wrong'}),code('UNAUTHORIZED_SUPERVISOR'));
  const scoped={role:'supervisor',assignedClubIds:[1],email:'scoped'};assert.equal((await f.scan(next.token,scoped)).canVerify,true);
});
test('write, audit and commit failures roll back and never return a green success',async()=>{
  for(const name of ['AttendanceRecord','AuditLog','commit']){const f=fixture(),qr=await f.issue();f.store.faults[name]=true;await assert.rejects(f.scan(qr.token));assert.equal(f.store.rows.AttendanceRecord.length,0);assert.equal(f.store.rows.AttendanceSession.length,0);assert.equal(f.store.rows.AuditLog.length,0);}
});
test('schemas enforce database uniqueness and preserve existing immutable account PK/profile write whitelist',()=>{
  const {AttendanceRecord,StudentAccount}=require('../models');assert.ok(AttendanceRecord.schema.indexes().some(([keys,options])=>keys.accountEventKey===1&&options.unique&&options.sparse));
  assert.equal(StudentAccount.schema.path('_id').instance,'ObjectId');
  const source=fs.readFileSync(require.resolve('../server'),'utf8'),profile=source.slice(source.indexOf("app.put('/api/student-auth/profile'"),source.indexOf("app.put('/api/student-auth/profile'")+2200);
  assert.doesNotMatch(profile,/req\.body\._id|req\.body\.studentAccountId/);
  const oldPost=source.slice(source.indexOf("app.post('/api/attendance/:token'"),source.indexOf("app.post('/api/attendance/:token'")+2000);assert.match(oldPost,/session.itemType !== 'booth'.*SUPERVISOR_SCAN_REQUIRED/);
});
test('an assigned student scanner cannot record their own attendance',async()=>{
  const f=fixture();f.store.rows.AttendanceAssignment.push({clubId:1,itemType:'event',eventRequestId:99,memberEmail:a.email,status:'accepted'});
  const qr=await f.issue();await assert.rejects(f.scan(qr.token,a),code('SELF_SCAN_FORBIDDEN'));assert.equal(f.store.rows.AttendanceRecord.length,0);
});
test('university supervisors retain their assigned review lane and organizer roles stay separate from membership',async()=>{
  const f=fixture(),reviewer={email:'reviewer@example.test',role:'supervisor',assignedClubIds:[]};
  f.store.rows.AttendanceSession.push({_id:'333333333333333333333333',sourceType:'miu',clubId:0,itemType:'event',eventRequestId:9,active:true,assignedSupervisorEmail:'other@example.test'});
  f.store.rows.AttendanceSession.push({_id:'444444444444444444444444',sourceType:'miu',clubId:0,itemType:'event',eventRequestId:9,active:true,assignedSupervisorEmail:reviewer.email,assignedMemberEmail:a.email,assignedMemberAccepted:true});
  const qr=await f.issue(a,miu);assert.equal((await f.scan(qr.token,reviewer,miu)).color,'green');
  const row=f.store.rows.AttendanceRecord[0];assert.equal(row.supervisorEmail,reviewer.email);assert.equal(row.sessionId,'444444444444444444444444');assert.equal(row.eventParticipation.role,'usher');assert.equal(row.membershipStatus,'non_member');
  await assert.rejects(f.service.configure(miu,reviewer,{capacity:2}),code('CAPACITY_FORBIDDEN'));
});
test('university attendance cannot silently lose its supervisor review assignment',async()=>{
  const f=fixture(),qr=await f.issue(a,miu);await assert.rejects(f.scan(qr.token,admin,miu),code('REVIEW_TEAM_REQUIRED'));assert.equal(f.store.rows.AttendanceRecord.length,0);
});
test('canonical event references survive array reordering and distinguish identical names and dates',async()=>{
  const f=fixture(),stable={...ref,eventRequestId:99};f.store.rows.Club[0].events.reverse();
  const qr=await f.issue(a,stable);await assert.rejects(f.scan(qr.token,admin,ref),code('WRONG_EVENT'));
  assert.equal((await f.scan(qr.token,admin,stable)).color,'green');assert.equal(f.store.rows.AttendanceRecord[0].eventRequestId,99);
});
test('historical attendance without the new account key still prevents a duplicate without rewriting history',async()=>{
  const f=fixture(),qr=await f.issue(),attendedAt=new Date(123456789);
  f.store.rows.AttendanceRecord.push({clubId:1,itemType:'event',eventRequestId:99,email:a.email,attendedAt});
  const duplicate=await f.scan(qr.token);assert.equal(duplicate.color,'red');assert.deepEqual(duplicate.attendedAt,attendedAt);assert.equal(f.store.rows.AttendanceRecord.length,1);assert.equal(f.store.rows.AttendanceRecord[0].accountEventKey,undefined);
});
