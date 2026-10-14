// Reviewed indexes present in the existing live Mongo database. Keep their
// constraints/performance in SQL without modifying the original Mongo schemas.
const indexes = {
  StudentFeedback: [{ keys: { kind: 1, targetId: 1, email: 1 }, unique: true }],
  AttendanceRecord: [
    { keys: { sessionId: 1, email: 1 }, unique: true },
    { keys: { clubId: 1, eventRequestId: 1, email: 1 }, unique: true }
  ],
  AttendanceSession: [{ keys: { clubId: 1, eventRequestId: 1, active: 1 }, unique: false }]
};
function legacyIndexes(modelName) { return indexes[modelName] || []; }
module.exports = { legacyIndexes };
