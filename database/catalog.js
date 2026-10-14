function catalog() {
  const models = {
    ...require('../models'),
    AccountPhoto: require('../services/account-photo').AccountPhoto,
    EventReport: require('../services/event-reports').EventReport,
    StudentFeedback: require('../services/student-feedback').StudentFeedback
  };
  // Parent order is explicit; references cannot be inferred from field names.
  const parents = ['Club', 'StudentAccount', 'ClubAccount', 'SpeakerInvite', 'AttendanceSession'];
  return Object.values(models).sort((a, b) => {
    const rank = m => parents.includes(m.modelName) ? parents.indexOf(m.modelName) : 100;
    return rank(a) - rank(b) || a.modelName.localeCompare(b.modelName);
  }).map(require('./schema').describe);
}
module.exports = { catalog };
