const crypto = require('node:crypto');
// Assign stable IDs before legacy array positions can be used by reverse QR.
// All historical references move atomically. Ambiguous history requires review.
async function migrateLegacyEvents(models, database) {
  const clubs = await models.Club.find({}).select('id events').lean();
  let migrated = 0;
  for (const club of clubs) {
    if (!(club.events || []).length) continue;
    const legacy = club.events.some(event => !Number.isSafeInteger(Number(event.requestId)) || Number(event.requestId) < 1);
    if (!legacy) {
      const pending = await models.EventRegistration.find({ clubId:club.id,eventRequestId:{$exists:false} }).select('eventIndex eventTitle').lean();
      if (!pending.some(row => club.events[row.eventIndex]?.title === row.eventTitle)) continue;
    }
    const session = await database.startSession();
    try {
      await session.withTransaction(async () => {
        if (!database.isSqlProvider) await models.Club.updateOne({ id: club.id }, { $inc: { registrationRevision: 1 } }, { session });
        const current = await models.Club.findOne({ id: club.id }).session(session).lean();
        const ids = new Set(current.events.map(event => Number(event.requestId)));
        const changes = {};
        for (const [index,event] of current.events.entries()) {
          if (Number.isSafeInteger(Number(event.requestId)) && Number(event.requestId) > 0) {
            const registrations = await models.EventRegistration.find({clubId:club.id,eventIndex:index,eventTitle:event.title,eventRequestId:{$exists:false}}).session(session).lean();
            for(const row of registrations)await models.EventRegistration.updateOne({_id:row._id},{$set:{eventRequestId:Number(event.requestId)}},{session});
            continue;
          }
          const previousId = -(index+1), filter = { clubId:club.id,itemType:'event',eventRequestId:previousId };
          for (const name of ['AttendanceRecord','AttendanceSession','AttendanceAssignment','AttendanceActivityClosure']) {
            const history = await models[name].find(filter).session(session).lean();
            if (history.some(row => row.eventTitle !== event.title || String(row.eventDate || '').slice(0,10) !== String(event.date || '').slice(0,10))) throw new Error('Ambiguous legacy event history: review club '+club.id+' event position '+index+'. No history was deleted.');
          }
          let id; do { id = crypto.randomBytes(6).readUIntBE(0,6); } while(!id || ids.has(id)); ids.add(id);
          changes[`events.${index}.requestId`] = id;
          for (const name of ['AttendanceRecord','AttendanceSession','AttendanceAssignment','AttendanceActivityClosure']) {
            const history = await models[name].find(filter).session(session).lean();
            for(const row of history)await models[name].updateOne({_id:row._id},{$set:{eventRequestId:id}},{session});
          }
          const registrations = await models.EventRegistration.find({clubId:club.id,eventIndex:index,eventTitle:event.title,eventRequestId:{$exists:false}}).session(session).lean();
          for(const row of registrations)await models.EventRegistration.updateOne({_id:row._id},{$set:{eventRequestId:id}},{session});
          migrated++;
        }
        if (Object.keys(changes).length) await models.Club.updateOne({id:club.id},{$set:changes},{session});
      });
    } finally { await session.endSession(); }
  }
  return migrated;
}
module.exports={migrateLegacyEvents};
