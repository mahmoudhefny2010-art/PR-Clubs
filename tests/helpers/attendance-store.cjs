// Transactional in-memory adapter for deterministic failure and concurrency tests.
// Real SQL constraints are covered separately; this is not a database substitute.
const { matches, update, clone } = require('../../database/values');
const crypto = require('node:crypto');
function attendanceStore(seed = {}) {
  let rows = clone(seed), queue = Promise.resolve();
  const faults = {};
  const query = fn => ({ select() { return this; }, session() { return this; }, sort() { return this; }, limit() { return this; }, lean: async () => clone(fn()), then(resolve,reject) { return Promise.resolve().then(fn).then(resolve,reject); } });
  const models = {};
  for (const name of ['Club','UniversityContent','Application','StudentAccount','EventRegistration','AttendanceRecord','AttendanceSession','AttendanceAssignment','AttendanceActivityClosure','AuditLog','DeviceBinding']) {
    rows[name] ||= [];
    const find = filter => rows[name].find(row => matches(row,filter));
    models[name] = {
      find: (filter = {}) => query(() => rows[name].filter(row => matches(row,filter))),
      findOne: (filter = {}) => query(() => find(filter) || null),
      findById: id => query(() => find({ _id: id }) || null),
      exists: filter => query(() => !!find(filter)),
      countDocuments: filter => query(() => rows[name].filter(row => matches(row,filter)).length),
      updateOne: async (filter, operation) => { const i=rows[name].findIndex(row=>matches(row,filter)); if(i<0)return {matchedCount:0}; rows[name][i]=update(rows[name][i],operation);return {matchedCount:1}; },
      findOneAndUpdate: (filter,operation) => query(() => { const i=rows[name].findIndex(row=>matches(row,filter)); if(i<0)return null;rows[name][i]=update(rows[name][i],operation);return rows[name][i]; }),
      create: async values => {
        if(faults[name])throw new Error('Injected '+name+' failure');
        const created=[];
        for(const value of values){
          for(const key of ['accountEventKey','registrationKey','deviceHash'])if(value[key]&&rows[name].some(row=>row[key]===value[key]))throw Object.assign(new Error('Duplicate'),{code:11000});
          const row={...clone(value),_id:crypto.randomBytes(12).toString('hex')};rows[name].push(row);created.push(row);
        }
        return created;
      },
      deleteOne: async filter=>{const i=rows[name].findIndex(row=>matches(row,filter));if(i>=0)rows[name].splice(i,1);}
    };
  }
  const database={startSession:async()=>({endSession:async()=>{},withTransaction:async fn=>{
    const previous=queue;let release;queue=new Promise(resolve=>release=resolve);await previous;const snapshot=clone(rows);
    try{const value=await fn();if(faults.commit)throw new Error('Injected commit failure');return value;}catch(error){rows=snapshot;throw error;}finally{release();}
  }})};
  return {models,database,faults,get rows(){return rows;}};
}
module.exports={attendanceStore};
