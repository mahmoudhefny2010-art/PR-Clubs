const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const runtime = require('../database/runtime');
const { catalog } = require('../database/catalog');
const { bindModel } = require('../database/models');

test('real SQL: CRUD, uniqueness, token consumption, references and retained supervisor history', {
  skip: process.env.SQLSERVER_INTEGRATION_TESTS !== 'true' ? 'Requires an explicitly configured isolated SQL Server test database.' : false
}, async () => {
  assert.notEqual(process.env.NODE_ENV, 'production');
  const prefix = require('../database/config').sqlPrefix();
  assert.ok(process.env[`${prefix}_DATABASE`]);
  assert.equal(process.env[`${prefix}_MIGRATION_TARGET_DATABASE`], process.env[`${prefix}_DATABASE`]);
  await runtime.connect({ readiness: false });
  const models = Object.fromEntries(catalog().map(s => [s.name, bindModel(s.model)]));
  const suffix = crypto.randomBytes(8).toString('hex');
  const session = new runtime.Session();
  // The complete test runs in one SQL transaction and ALWAYS rolls it back.
  await session.begin();
  try {
    const student = (await models.StudentAccount.create([{ email: `sql-${suffix}@example.test`, name: 'SQL Test', universityId: '00012' }], { session }))[0];
    assert.equal((await models.StudentAccount.findById(student._id).session(session).lean()).universityId, '00012');
    await models.StudentAccount.updateOne({ _id: student._id }, { $inc: { sessionVersion: 1 } }, { session });
    assert.equal((await models.StudentAccount.findById(student._id).session(session).lean()).sessionVersion, 1);
    const token = (await models.PasswordResetToken.create([{ accountType: 'student', email: student.email, tokenHash: suffix, expiresAt: new Date(Date.now() + 60000) }], { session }))[0];
    assert.ok(await models.PasswordResetToken.findOneAndDelete({ _id: token._id }).session(session).lean());
    assert.equal(await models.PasswordResetToken.findById(token._id).session(session).lean(), null);
    // Verify declared relationship metadata against real catalog, without creating
    // synthetic club data or disabling constraints.
    const constraints = await runtime.request(session).query("SELECT name FROM sys.foreign_keys WHERE is_disabled=0 AND is_not_trusted=0;");
    assert.ok(constraints.recordset.some(r => r.name === 'FK_AttendanceRecord_sessionId'));
    const credentials = await require('../services/account-passwords').hashAccountPassword('sql-test-password-123');
    const staff = (await models.ClubAccount.create([{ clubId: 0, email: `staff-${suffix}@example.test`, role: 'supervisor', ...credentials }], { session }))[0];
    assert.equal(require('../services/account-passwords').matchesAccountPassword('sql-test-password-123', staff), true);
    const review = (await models.SupervisorReview.create([{ supervisorId: staff._id, supervisorEmail: staff.email, clubId: 0, targetType: 'content', targetId: suffix, note: 'Retained history' }], { session }))[0];
    await models.ClubAccount.findOneAndDelete({ _id: staff._id }).session(session);
    const preserved = await models.SupervisorReview.findById(review._id).session(session).lean();
    assert.equal(String(preserved.supervisorId), String(staff._id)); assert.equal(preserved.note, 'Retained history');
    const link = await runtime.request(session).input('id', String(review._id)).query('SELECT [_supervisorReference] FROM [dbo].[SupervisorReview] WHERE [_id]=@id;');
    assert.equal(link.recordset[0]._supervisorReference, null);
    // This is last because XACT_ABORT may roll back the test transaction.
    await assert.rejects(models.StudentAccount.create([{ email: student.email, name: 'Duplicate' }], { session }), { code: 11000 });
  } finally { await session.abortTransaction(); await runtime.disconnect(); }
});

test('real SQL: public revisions change with writes and roll back with the same transaction', {
  skip: process.env.SQLSERVER_INTEGRATION_TESTS !== 'true' ? 'Requires an explicitly configured isolated SQL target with the notification migration.' : false
}, async () => {
  assert.notEqual(process.env.NODE_ENV, 'production');
  const prefix = require('../database/config').sqlPrefix();
  assert.ok(process.env[`${prefix}_DATABASE`]);
  assert.equal(process.env[`${prefix}_MIGRATION_TARGET_DATABASE`], process.env[`${prefix}_DATABASE`]);
  await runtime.connect({ readiness: false });
  const session = new runtime.Session();
  const select = 'SELECT CONVERT(VARCHAR(20), [clubs]) AS clubs, CONVERT(VARCHAR(20), [universityContent]) AS universityContent FROM [dbo].[PlatformPublicRevision] WHERE [id] = 1;';
  try {
    const before = (await runtime.request().query(select)).recordset[0];
    assert.ok(before);
    await session.begin();
    // A no-op statement must not notify visitors.
    await runtime.request(session).query('UPDATE [dbo].[UniversityContent] SET [title] = [title] WHERE 1 = 0;');
    assert.deepEqual((await runtime.request(session).query(select)).recordset[0], before);
    const model = bindModel(catalog().find(spec => spec.name === 'UniversityContent').model);
    const highest = await model.findOne().sort({ id: -1 }).session(session).lean();
    const id = (Number(highest?.id) || 0) + 1;
    const created = (await model.create([{ id, type: 'announcement', title: 'SQL rollback notification test', description: 'Isolated transaction only' }], { session }))[0];
    const inserted = (await runtime.request(session).query(select)).recordset[0];
    assert.equal(BigInt(inserted.universityContent), BigInt(before.universityContent) + 1n);
    assert.equal(inserted.clubs, before.clubs);
    await model.findOneAndDelete({ _id: created._id }).session(session);
    const deleted = (await runtime.request(session).query(select)).recordset[0];
    assert.equal(BigInt(deleted.universityContent), BigInt(before.universityContent) + 2n);
    await session.abortTransaction();
    assert.deepEqual((await runtime.request().query(select)).recordset[0], before);
  } finally { await session.abortTransaction(); await runtime.disconnect(); }
});
