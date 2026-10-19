function catalog() {
  const models = {
    ...require('../models'),
    AccountPhoto: require('../services/account-photo').AccountPhoto,
    EventReport: require('../services/event-reports').EventReport,
    StudentFeedback: require('../services/student-feedback').StudentFeedback,
    QuizSubmission: require('../services/quiz-analytics').QuizSubmission,
    ...require('../services/workflow-models'),
    ...require('../services/attendance-device-model'),
    ...require('../services/custom-staff-role-model')
  };
  // Parent order is explicit; references cannot be inferred from field names.
  const parents = ['Club', 'StudentAccount', 'ClubAccount', 'SpeakerInvite', 'AttendanceSession'];
  return Object.values(models).sort((a, b) => {
    const rank = m => parents.includes(m.modelName) ? parents.indexOf(m.modelName) : 100;
    return rank(a) - rank(b) || a.modelName.localeCompare(b.modelName);
  }).map(require('./schema').describe);
}
module.exports = { catalog };
