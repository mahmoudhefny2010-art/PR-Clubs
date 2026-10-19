const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
test('real SQL reverse attendance: encrypted QR, concurrent duplicate, shared device verification, stable PK and database unique key',{
  skip:process.env.SQLSERVER_INTEGRATION_TESTS!=='true'?'Requires the explicitly gated local SQL development target and migration 009.':false
},async()=>{
  require('../scripts/sqlserver-migrate.cjs').targetGate();
  const database=require('../database'),models=require('../models'),{AttendanceDeviceBinding}=require('../services/attendance-device-model');
  const {createReverseAttendance}=require('../services/reverse-attendance'),{localInstant}=require('../services/event-attendance-context');
  const runtime=require('../database/runtime');await runtime.connect();
  const suffix=crypto.randomBytes(8).toString('hex'),clubId=crypto.randomInt(100000000,999999999),eventId=crypto.randomInt(100000000,999999999),emailA=`qr-a-${suffix}@example.test`,emailB=`qr-b-${suffix}@example.test`,admin={admin:true,role:'admin',email:`qr-admin-${suffix}@example.test`};
  const key=`sql-browser-${suffix}`,date='2099-10-19',ref={source:'club',clubId,eventIndex:0};
  let a,b;
  const service=createReverseAttendance({...models,database,DeviceBinding:AttendanceDeviceBinding,secret:'sql-test-secret-with-more-than-thirty-two-characters',clock:()=>localInstant(date,'11:50'),deviceHash:req=>req.device});
  try{
    await models.Club.create([{id:clubId,name:'SQL QR test '+suffix,committee:'Test',category:'Test',tagline:'Test',image:'/test.png',description:'Synthetic isolated QR test',requirements:'Test',events:[{requestId:eventId,title:'QR concurrency test',date,time:'12:00',attendanceEnabled:true,capacity:2}]}]);
    [a,b]=await models.StudentAccount.create([{email:emailA,name:'SQL QR A',universityId:'000123'},{email:emailB,name:'SQL QR B',universityId:'000456'}]);
    await models.EventRegistration.create([a,b].map((student,i)=>({id:Date.now()*1000+i,clubId,eventIndex:0,eventRequestId:eventId,eventTitle:'QR concurrency test',name:student.name,email:student.email,studentAccountId:student._id,registrationKey:`sql-test:${suffix}:${i}`})));
    const qr=await service.issue(ref,a,{device:key},{});
    const results=await Promise.all([service.scan(ref,admin,{token:qr.token},{},{}),service.scan(ref,admin,{token:qr.token},{},{})]);assert.deepEqual(results.map(r=>r.color).sort(),['green','red']);
    const record=await models.AttendanceRecord.findOne({clubId,eventRequestId:eventId,email:emailA}).lean();assert.equal(String(record.reverseAttendance.accountId),String(a._id));assert.equal(record.universityId,'000123');assert.equal(await models.AttendanceRecord.countDocuments({clubId,eventRequestId:eventId}),1);
    const switched=await service.issue(ref,b,{device:key},{}),warning=await service.scan(ref,admin,{token:switched.token},{},{});assert.equal(warning.color,'yellow');assert.equal(await models.AttendanceRecord.countDocuments({clubId,eventRequestId:eventId}),1);
    const verified=await service.scan(ref,admin,{verificationToken:warning.verificationToken,verifiedIdentity:true,verificationNote:'Test university card checked'},{},{});assert.equal(verified.color,'green');assert.equal(await models.AttendanceRecord.countDocuments({clubId,eventRequestId:eventId}),2);
    await models.StudentAccount.updateOne({_id:a._id},{$set:{name:'SQL QR renamed'}});assert.equal(String((await models.StudentAccount.findOne({email:emailA}).lean())._id),String(a._id));
    await assert.rejects(models.AttendanceRecord.create([{...record,_id:undefined,email:`qr-unique-${suffix}@example.test`}]),{code:11000});
    const overview=await service.overview(ref,admin,{},{});assert.equal(overview.registrationCount,2);assert.equal(overview.attendanceCount,2);
    // Real capacity contention through the production university handler.
    await models.UniversityContent.create([{id:eventId,type:'event',title:'QR concurrency test',description:'Synthetic SQL attendance '+suffix,date,time:'12:00',registrationEnabled:true,attendanceEnabled:true,attendanceSettings:{registrationCapacity:1,cancellationEnabled:true}}]);
    const {handleUniversityRegistration}=require('../services/university-event-registration');
    async function registerUniversity(student,method='POST') {
      const response={statusCode:200,setHeader(){},status(value){this.statusCode=value;return this;},json(value){this.body=value;return this;}};
      await handleUniversityRegistration({method,params:{id:String(eventId)},studentAccount:student,body:{}},response,{...models,database,sameOrigin:()=>true});return response;
    }
    const registrations=await Promise.all([registerUniversity(a),registerUniversity(b)]);assert.deepEqual(registrations.map(r=>r.statusCode).sort(),[201,409]);
    const winner=registrations[0].statusCode===201?a:b,loser=winner===a?b:a;
    assert.equal((await registerUniversity(winner)).body.alreadyRegistered,true);
    const [lane]=await models.AttendanceSession.create([{sourceType:'miu',clubId:0,itemType:'event',eventRequestId:eventId,eventTitle:'QR concurrency test',eventDate:date,eventTime:'12:00',active:true,assignedSupervisorEmail:`qr-supervisor-${suffix}@example.test`,createdBy:admin.email,tokenHash:crypto.randomBytes(32).toString('hex')}]);
    const miu={source:'miu',clubId:0,eventIndex:eventId},universityQr=await service.issue(miu,winner,{device:key+'-miu'},{});
    assert.equal((await service.scan(miu,admin,{token:universityQr.token},{},{})).color,'green');
    const universityRecord=await models.AttendanceRecord.findOne({clubId:0,eventRequestId:eventId}).lean();assert.equal(universityRecord.supervisorEmail,lane.assignedSupervisorEmail);
    assert.equal((await registerUniversity(winner,'DELETE')).statusCode,200);assert.equal(await models.AttendanceRecord.countDocuments({clubId:0,eventRequestId:eventId}),1);
    assert.equal((await registerUniversity(loser)).statusCode,201);
    const reduced=await service.configure(miu,admin,{capacity:0});assert.equal(reduced.full,true);assert.equal(reduced.registeredCount,1);
    // Reusing array position zero for another event must not collide with the
    // first event's registration or attendance identity.
    const club=await models.Club.findOne({id:clubId}).lean(),original=club.events[0];
    await models.Club.updateOne({id:clubId},{$set:{events:[{...original,requestId:eventId+1,title:'Other event'},original]}});
    let clubRegister;require('../services/student-event-registration').registerStudentEvents({get(){},delete(){},post(path,auth,handler){clubRegister=handler;}},{...models,mongoose:database,requireStudentAuth(){},sameOrigin:()=>true,databaseReady:()=>true});
    const response={statusCode:200,setHeader(){},status(value){this.statusCode=value;return this;},json(value){this.body=value;return this;}};
    await clubRegister({method:'POST',params:{clubId:String(clubId),eventIndex:'0'},query:{eventRequestId:String(eventId+1)},studentAccount:a,body:{}},response);
    assert.equal(response.statusCode,201);assert.equal(await models.EventRegistration.countDocuments({clubId,email:emailA}),2);
    const relocated=await service.context.resolve({...ref,eventRequestId:eventId});assert.equal(relocated.eventIndex,1);assert.equal(relocated.eventRequestId,eventId);
  }catch(error){ console.error("SQL attendance integration failure:",error.code||error.name,error.message); throw error; }finally{
    // The web principal intentionally cannot delete append-only AuditLog rows.
    // Use protected operations credentials only to remove these synthetic fixtures.
    await database.disconnect();
    const sql=require('mssql'),{sqlConfig,sqlPrefix}=require('../database/config'),config=sqlConfig(),prefix=sqlPrefix();
    assert.ok(process.env[prefix+'_OPERATIONS_USER']&&process.env[prefix+'_OPERATIONS_PASSWORD']);
    config.user=process.env[prefix+'_OPERATIONS_USER'];config.password=process.env[prefix+'_OPERATIONS_PASSWORD'];
    const pool=await new sql.ConnectionPool(config).connect();
    try{await pool.request().input('clubId',sql.Float,clubId).input('eventId',sql.Float,eventId).input('device',sql.NVarChar(254),key).input('miuDevice',sql.NVarChar(254),key+'-miu').input('admin',sql.NVarChar(254),admin.email).input('a',sql.NVarChar(254),emailA).input('b',sql.NVarChar(254),emailB).input('clubName',sql.NVarChar(254),'SQL QR test '+suffix).input('description',sql.NVarChar(254),'Synthetic SQL attendance '+suffix).query(`
      IF EXISTS(SELECT 1 FROM dbo.Club WHERE id=@clubId AND name=@clubName) BEGIN
        DELETE FROM dbo.StudentInterest WHERE clubId=@clubId;
        DELETE FROM dbo.AttendanceRecord WHERE clubId=@clubId;
        DELETE FROM dbo.EventRegistration WHERE clubId=@clubId;
        DELETE FROM dbo.AttendanceSession WHERE clubId=@clubId;
        DELETE FROM dbo.Club WHERE id=@clubId AND name=@clubName;
      END;
      IF EXISTS(SELECT 1 FROM dbo.UniversityContent WHERE id=@eventId AND description=@description) BEGIN
        DELETE FROM dbo.AttendanceRecord WHERE clubId=0 AND eventRequestId=@eventId;
        DELETE FROM dbo.EventRegistration WHERE clubId=0 AND eventRequestId=@eventId;
        DELETE FROM dbo.AttendanceSession WHERE clubId=0 AND eventRequestId=@eventId;
        DELETE FROM dbo.UniversityContent WHERE id=@eventId AND description=@description;
      END;
      DELETE FROM dbo.AttendanceDeviceBinding WHERE deviceHash IN (@device,@miuDevice);
      DELETE FROM dbo.AuditLog WHERE actorEmail=@admin;
      DELETE FROM dbo.StudentAccount WHERE email IN (@a,@b);
    `);}finally{await pool.close();}
  }
});
