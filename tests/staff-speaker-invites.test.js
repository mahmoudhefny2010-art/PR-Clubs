const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const vm = require('node:vm');
const fs = require('node:fs');
const { registerStaffSpeakerInvites } = require('../services/staff-speaker-invites');
const query = value => ({ select(){return this;},sort(){return this;},lean:async()=>value });
async function fixture(t) {
  const app=express(); app.use(express.json()); const writes=[];
  const auth=(req,res,next)=>{ const role=req.headers['x-role']; if(!role)return res.sendStatus(401);req.clubAccount={role,email:'manager@example.test',assignedClubIds:[7]};next(); };
  registerStaffSpeakerInvites(app,{requireClubAuth:auth,requireLiveDatabase:()=>true,isSameOriginRequest:req=>req.headers['x-cross-origin']!=='yes',
    Club:{find:filter=>query([{id:7,name:'Assigned'},...(filter.id?[]:[{id:8,name:'Other'}])]),findOne:filter=>query(filter.id===99?null:{id:filter.id,name:'Club'})},
    getOrCreateStableSpeakerInvite:async(club,actor,rotate)=>{writes.push({club,actor,rotate});return {invite:club,token:'fixture',reused:!rotate};},speakerInviteResponse:(invite,token,reused)=>({clubName:invite.name,url:'/speaker-intake.html?t='+token,reused})});
  const source=fs.readFileSync(require.resolve('../server'),'utf8');
  const a=source.indexOf("app.post('/api/public/speaker-invites/:token/submit'"); const b=source.indexOf("app.get('/api/speaker-requests/context'",a);
  let hostId=0; const records=[];
  vm.runInNewContext(source.slice(a,b),{app,isSameOriginRequest:()=>true,requireLiveDatabase:()=>true,
    findSpeakerInvite:async()=>({clubId:hostId,createdByRole:'supervisor',createdByEmail:'manager@example.test',_id:'invite'}),
    speakerUploadAttempts:new Map(),validatePublicSpeakerInvitePayload:require('../services/speaker-requests').validatePublicSpeakerInvitePayload,
    Club:{findOne:()=>query({id:hostId,name:'Club'})},publicSpeakerDuplicateKey:(id,email)=>id+':'+email,
    SpeakerRequest:{exists:async()=>false,create:async record=>{records.push(record);return record;}},
    dynamicWorkflowEngine:{createNew:async(kind,record)=>{assert.equal(kind,'speaker');records.push(record);return record;}},console});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>server.close());
  const request=async(path,role='supervisor',body,headers={})=>fetch('http://127.0.0.1:'+server.address().port+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(role?{'x-role':role}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
  return {request,writes,records,setHost:id=>hostId=id};
}
test('Dean and Supervisor receive MIU; Supervisor sees only assigned clubs',async t=>{const f=await fixture(t);assert.deepEqual((await (await f.request('/api/supervisor/speaker-invites/clubs')).json()).map(x=>x.id),[0,7]);assert.deepEqual((await(await f.request('/api/dean/speaker-invites/clubs','dean')).json()).map(x=>x.id),[0,7,8]);});
test('authorized links support MIU, clubs and rotation; unauthorized roles and clubs denied',async t=>{const f=await fixture(t);for(const role of ['dean','supervisor'])for(const clubId of [0,7])assert.equal((await f.request('/api/'+role+'/speaker-invites',role,{clubId,rotate:true})).status,201);assert.equal(f.writes.length,4);assert.equal(f.writes[0].club.name,'MIU');assert.equal((await f.request('/api/supervisor/speaker-invites','supervisor',{clubId:8})).status,403);for(const role of ['student','head','president','pr'])assert.equal((await f.request('/api/dean/speaker-invites',role,{clubId:0})).status,403);assert.equal((await f.request('/api/dean/speaker-invites',null,{clubId:0})).status,401);assert.equal(f.writes.length,4);});
test('blank/invalid hosting, archived clubs and cross-origin mutations rejected',async t=>{const f=await fixture(t);for(const clubId of ['',null,true,-1,1.5,'bad'])assert.equal((await f.request('/api/dean/speaker-invites','dean',{clubId})).status,400);assert.equal((await f.request('/api/dean/speaker-invites','dean',{clubId:99})).status,404);assert.equal((await f.request('/api/dean/speaker-invites','dean',{clubId:0},{'x-cross-origin':'yes'})).status,403);assert.equal(f.writes.length,0);});
test('public MIU invitation saves university request for Dean; club invitations preserve club stage',async t=>{const f=await fixture(t);const payload={fullName:'Dr Example',jobTitleCompany:'Researcher',email:'speaker@example.test',proposedTopic:'Research methods',sessionFormat:'Online',availability:'Monday'};assert.equal((await f.request('/api/public/speaker-invites/fixture/submit','supervisor',payload)).status,201);assert.equal(f.records[0].clubId,0);assert.equal(f.records[0].hostingType,'miu');assert.equal(f.records[0].status,'pending_dean');assert.equal(f.records[0].assignedHeadEmail,'');f.setHost(7);assert.equal((await f.request('/api/public/speaker-invites/fixture/submit','supervisor',payload)).status,201);assert.equal(f.records[1].status,'pending_club');assert.equal(f.records[1].hostingType,'club');});
