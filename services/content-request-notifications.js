const { claimOneSignalDispatch, sendOneSignalPush } = require('./onesignal');

const clubExternalId = (account) => `club-account:${account._id}`;
const stages = { pending_pr: 'pr', pending_sso: 'sso', pending_english: 'english', pending_security: 'security', pending_dean: 'dean' };

function recipientFilter(record) {
  const targets = [{ clubId: record.clubId, role: 'president' }, { role: 'supervisor', assignedClubIds: record.clubId }];
  if (record.assignedHeadEmail && record.type !== 'entry_permit'
    && ['draft', 'changes_requested', 'rejected'].includes(record.status)) {
    targets.push({ clubId: record.clubId, role: 'head', email: record.assignedHeadEmail });
  }
  if (stages[record.status]) targets.push({ role: stages[record.status] });
  return { $or: targets };
}

function createContentRequestNotifier({ ClubAccount, NotificationDispatch, env = process.env, send = sendOneSignalPush, logger = console }) {
  return async function notify(record) {
    const event = record.workflowHistory?.[record.workflowHistory.length - 1];
    if (!event || !env.ONESIGNAL_APP_ID || !env.ONESIGNAL_REST_API_KEY || !env.ONESIGNAL_SITE_URL) return;
    let eventKey;
    try {
      const base = new URL(env.ONESIGNAL_SITE_URL);
      if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname))) return;
      const accounts = await ClubAccount.find(recipientFilter(record)).select('_id role').lean();
      const actions = {
        submitted: 'was submitted', resubmitted: 'was edited and resubmitted', edited: 'was edited',
        request_edit: 'needs changes', reject: 'was rejected', approve: 'was approved',
        comment: 'has new feedback', note: 'has new feedback', supervisor_approved: 'was approved by the club supervisor', comment_deleted: 'has updated feedback',
        restarted_review: 'has restarted review', deleted: 'was deleted', delete: 'was deleted',
        assigned: 'has an updated task assignment'
      };
      const action = actions[event.action] || 'has a workflow update';
      // Separate groups have different destinations; never put private review comments in push content.
      await Promise.all([...new Set(accounts.map(account => account.role))].map(async role => {
        const key = `content-workflow:${record._id}:${event._id || record.workflowHistory.length}:${role}`;
        eventKey = key;
        try {
          if (!await claimOneSignalDispatch(key, value => NotificationDispatch.create({ eventKey: value, status: 'sending' }))) return;
          const path = ['president', 'head'].includes(role) ? '/club-login' : `/dashboards/${role}-dashboard.html`;
          const result = await send({ appId: env.ONESIGNAL_APP_ID, apiKey: env.ONESIGNAL_REST_API_KEY,
            externalIds: accounts.filter(account => account.role === role).map(clubExternalId),
            title: 'MIU Clubs · Request update',
            message: `Your ${record.type.replace(/_/g, ' ')} request #${record.id} ${action}. Open your dashboard for details.`,
            url: new URL(path, base).toString() });
          await NotificationDispatch.updateOne({ eventKey: key }, { $set: {
            status: result.messageId ? 'sent' : 'no_recipient', providerMessageId: result.messageId
          } });
        } catch (error) {
          await NotificationDispatch.updateOne({ eventKey: key }, { $set: { status: 'failed', errorCode: 'PUSH_FAILED' } }).catch(() => {});
          logger.error('Content request notification failed:', error.name);
        }
      }));
    } catch (error) {
      logger.error('Content request notification lookup failed:', error.name);
    }
  };
}

module.exports = { clubExternalId, recipientFilter, createContentRequestNotifier };
