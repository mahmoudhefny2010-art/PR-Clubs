const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { registerPublicClubMedia } = require('../services/public-club-media');
const { mediaQuery } = require('../database/public-club-media');

test('SQL media extraction reads a single large asset without streaming full club records', () => {
  const ref = { clubId: 1, collection: 'events', index: 0, field: 'image', version: 1234 };
  const sql = mediaQuery(ref);
  assert.match(sql, /OPENJSON\(\[_payload\]\) WITH \(\[value\] NVARCHAR\(MAX\)/);
  assert.match(sql, /\$\."events"\[0\]\."image"/);
  assert.match(sql, /\[archivedAt\] IS NULL/);
  assert.match(sql, /\[updatedAt\] = @updatedAt/);
  assert.doesNotMatch(sql, /SELECT \[_payload\]/);
  assert.throws(() => mediaQuery({ ...ref, collection: 'events\x27); DROP TABLE Club' }));
  assert.throws(() => mediaQuery({ ...ref, field: 'email' }));
  assert.throws(() => mediaQuery({ ...ref, index: -1 }));
});

test('SQL media reader preserves bytes and avoids the generic aggregate path', async t => {
  const bytes = Buffer.from('large asset '.repeat(1500));
  const app = express();
  let reference;
  registerPublicClubMedia(app, {
    Club: { aggregate() { throw new Error('Full club streaming should not run.'); } },
    requireLiveDatabase: () => true,
    readMedia: async value => { reference = value; return 'data:image/png;base64,' + bytes.toString('base64'); }
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/public-club-media/1/events/0/image?v=1234`);
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  assert.deepEqual(reference, { clubId: 1, collection: 'events', index: 0, field: 'image', version: 1234 });
});

test('public media preserves bytes, restricts fields, excludes archived/version-changed records and handles DB failure', async (t) => {
  const app = express();
  const pipelines = [];
  const bytes = Buffer.from('exact image payload');
  let fail = false;
  const Club = { aggregate(pipeline) {
    pipelines.push(pipeline);
    return { read() { return this; }, async readConcern() {
      if (fail) throw new Error('Unavailable');
      if (pipeline[0].$match.updatedAt.getTime() !== 1234) return [];
      const pdf = pipeline[1].$project.value.$let.in.endsWith('sponsorAttachment');
      return [{ value: `data:${pdf ? 'application/pdf' : 'image/png'};base64,${bytes.toString('base64')}` }];
    } };
  } };
  registerPublicClubMedia(app, { Club, requireLiveDatabase: () => true });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/public-club-media/1/`;
  const image = await fetch(base + 'events/0/image?v=1234');
  assert.equal(image.status, 200);
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), bytes);
  assert.match(image.headers.get('content-type'), /image\/png/);
  assert.match(image.headers.get('cache-control'), /public, max-age=3600/);
  assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
  assert.match(image.headers.get('content-security-policy'), /sandbox/);
  assert.equal(pipelines[0][0].$match.archivedAt, null);
  assert.equal(pipelines[0][0].$match.id, 1);
  const pdf = await fetch(base + 'sponsors/0/sponsorAttachment?v=1234');
  assert.equal(pdf.status, 400, 'Private sponsor attachments cannot be fetched publicly');

  for (const suffix of ['memberRoster/0/email?v=1234', 'events/0/private?v=1234', 'events/-1/image?v=1234', 'events/0/image?v=bad']) {
    assert.equal((await fetch(base + suffix)).status, 400);
  }
  assert.equal((await fetch(base + 'events/0/image?v=1235')).status, 404);
  fail = true;
  assert.equal((await fetch(base + 'events/0/image?v=1234')).status, 503);
});
