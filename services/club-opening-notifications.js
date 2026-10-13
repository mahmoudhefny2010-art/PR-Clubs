const crypto = require('crypto');
const { sendOneSignalPush, claimOneSignalDispatch } = require('./onesignal');
const { clubExternalId } = require('./content-request-notifications');

function createClubOpeningNotifier({ StudentAccount, ClubAccount, NotificationDispatch,
  getAdminEmail = () => '', env = process.env, send = sendOneSignalPush, logger = console }) {
  return async function notifyClubOpening(previousStatus, club) {
    if (!club || club.status !== 'open' || previousStatus === 'open' || club.archivedAt) return;
    if (!env.ONESIGNAL_APP_ID || !env.ONESIGNAL_REST_API_KEY || !env.ONESIGNAL_SITE_URL) return;
    const cycle = new Date(club.applicationCycleStartedAt).getTime();
    if (!Number.isFinite(cycle) || cycle <= 0) return;
    const openingKey = `club-opened:${club.id}:${cycle}`;
    let claimedOpening = false;
    try {
      const origin = new URL(env.ONESIGNAL_SITE_URL);
      if (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname))) return;
      claimedOpening = await claimOneSignalDispatch(openingKey, key => NotificationDispatch.create({ eventKey: key, status: 'sending' }));
      if (!claimedOpening) return;
      const [students, staff] = await Promise.all([
        StudentAccount.find({}).select('_id').lean(), ClubAccount.find({}).select('_id').lean()
      ]);
      const adminEmail = getAdminEmail();
      const ids = [...new Set([...students.map(account => String(account._id)), ...staff.map(clubExternalId),
        ...(adminEmail ? [`admin-account:${crypto.createHash('sha256').update(adminEmail.toLowerCase()).digest('hex')}`] : [])])].sort();
      const name = String(club.name || 'A club').trim().slice(0, 100);
      let failed = false;
      for (let offset = 0; offset < ids.length; offset += 1000) {
        const externalIds = ids.slice(offset, offset + 1000);
        const eventKey = `club-opened:${club.id}:${cycle}:${offset / 1000}`;
        try {
          const claimed = await claimOneSignalDispatch(eventKey, key => NotificationDispatch.create({ eventKey: key, status: 'sending' }));
          if (!claimed) continue;
          const result = await send({ appId: env.ONESIGNAL_APP_ID, apiKey: env.ONESIGNAL_REST_API_KEY,
            externalIds, title: 'MIU Clubs · Applications open',
            message: `${name} is now open for applications. Check it now!`,
            url: new URL(`/?apply=${encodeURIComponent(club.id)}`, origin).toString() });
          await NotificationDispatch.updateOne({ eventKey }, { $set: {
            status: result.messageId ? 'sent' : 'no_recipient', providerMessageId: result.messageId
          } });
        } catch (error) {
          failed = true;
          await NotificationDispatch.updateOne({ eventKey }, { $set: { status: 'failed', errorCode: 'PUSH_FAILED' } }).catch(() => {});
          logger.error('Club opening notification failed:', error.name);
        }
      }
      await NotificationDispatch.updateOne({ eventKey: openingKey }, { $set: { status: failed ? 'failed' : ids.length ? 'sent' : 'no_recipient' } });
    } catch (error) {
      if (claimedOpening) await NotificationDispatch.updateOne({ eventKey: openingKey }, { $set: { status: 'failed', errorCode: 'PUSH_FAILED' } }).catch(() => {});
      logger.error('Club opening notification lookup failed:', error.name);
    }
  };
}

module.exports = { createClubOpeningNotifier };
