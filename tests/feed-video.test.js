const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { validateFeedMedia, MAX_FEED_VIDEO_BYTES } = require('../services/feed-video');
const media = require('../public/assets/js/feed-media');
const image = 'https://res.cloudinary.com/demo/image/upload/photo.jpg';
const source = 'https://res.cloudinary.com/demo/video/upload/v1/miu-feed-media/miu-feed-media-test.mp4';
const publicId = 'miu-feed-media/miu-feed-media-test';
function fixture(overrides = {}) {
  const calls = [];
  return { calls, cloudName: 'demo', cloudinary: { api: { resource: async (id, options) => {
    calls.push({ id, options });
    return { resource_type: 'video', format: 'mp4', bytes: 1024, secure_url: source, ...overrides };
  } } } };
}
test('feed video uses verified Cloudinary media while images and empty drafts remain supported', async () => {
  const deps = fixture();
  assert.equal(await validateFeedMedia('feed', { image: source, videoPublicId: publicId }, '', deps), source);
  assert.deepEqual(deps.calls, [{ id: publicId, options: { resource_type: 'video', type: 'upload' } }]);
  assert.equal(await validateFeedMedia('feed', { image }, '', deps), image);
  assert.equal(await validateFeedMedia('feed', {}, '', deps), '');
  assert.equal(await validateFeedMedia('feed', { image: source }, source, deps), source, 'Saved drafts resubmit without another upload');
  assert.equal(deps.calls.length, 1);
});
test('videos cannot replace required event or club images or bypass upload validation', async () => {
  for (const type of ['event', 'club', 'sponsor', 'booth']) await assert.rejects(validateFeedMedia(type, { image: source }, '', fixture()), /feed posts only/);
  for (const body of [
    { image: 'data:video/mp4;base64,AAAA' },
    { image: source, videoPublicId: 'another-folder/video' },
    { image: source.replace('/demo/', '/other/'), videoPublicId: publicId },
    { image: source.replace('https:', 'http:'), videoPublicId: publicId }
  ]) await assert.rejects(validateFeedMedia('feed', body, '', fixture()), /valid MP4 or WebM/);
  for (const asset of [{ bytes: MAX_FEED_VIDEO_BYTES + 1 }, { resource_type: 'image' }, { format: 'mov' }, { secure_url: source + '?different=1' }]) {
    await assert.rejects(validateFeedMedia('feed', { image: source, videoPublicId: publicId }, '', fixture(asset)), /valid MP4 or WebM/);
  }
});
test('video cards contain only a lazy poster until clicked, and escape post titles', () => {
  const html = media.render(source, '<script>bad</script>', 'feed-timeline-image');
  assert.ok(html.includes('data-feed-video=')); assert.ok(html.includes('loading="lazy"'));
  assert.ok(!html.includes('<video')); assert.ok(!html.includes('<script>'));
  assert.equal(media.poster(source), source.replace('/upload/', '/upload/so_0,f_jpg/').replace('.mp4', '.jpg'));
  assert.ok(media.render(image, 'Existing image').startsWith('<img'));
  assert.equal(media.isVideo('https://res.cloudinary.com.evil.test/demo/video/upload/a.mp4'), false);
});
test('the actual create and publish workflow preserves video URLs in the existing media field', async () => {
  const code = fs.readFileSync(require.resolve('../server.js'), 'utf8');
  const create = code.slice(code.indexOf('async function createContentRequest('), code.indexOf("app.put('/api/club/content/:id'"));
  const publish = code.slice(code.indexOf('function buildPublishedItem('), code.indexOf('// Shared type-aware notice'));
  const deps = fixture(); let stored, notifications = 0;
  const context = {
    mongoReady: true, validateFeedMedia, cloudinary: deps.cloudinary, cloudinaryCredentials: { cloud_name: 'demo' },
    contentTitle: (type, body) => body.title, cleanText: value => String(value || '').trim(), clubs: [{ id: 1, name: 'Club' }],
    extractContentFields: () => ({}), missingRequiredPublicContentImage: (type, body) => !body.image,
    contentSingularLabel: type => type, appendWorkflowEvent: () => {}, notifyContentRequest: async () => { notifications++; }, console,
    ContentRequest: { findOne: () => ({ sort: () => ({ lean: async () => null }) }), create: async data => {
      stored = data; return { ...data, save: async () => {}, toObject: () => data };
    } }
  };
  vm.createContext(context); vm.runInContext(create + publish, context);
  const req = { body: { title: 'Video post', description: 'A club update', image: source, videoPublicId: publicId, submit: true }, clubAccount: { clubId: 1, role: 'president' } };
  const response = { status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; } };
  await context.createContentRequest(req, response, 'feed');
  assert.equal(response.statusCode, 201); assert.equal(stored.status, 'pending_supervisor'); assert.equal(notifications, 1);
  const published = context.buildPublishedItem(stored, { name: 'Club', image });
  assert.equal(published.image, source); assert.equal(published.text, req.body.description);
  assert.equal(stored.videoPublicId, undefined, 'No new database columns or schema changes are needed');
});
