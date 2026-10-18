const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { publicIdFromCloudinaryUrl, verifyPublicCloudinaryImage, verifyCloudinaryUploadResponse } = require('../services/cloudinary-image-validation');

const cloudName = 'demo-cloud';
const publicId = 'miu-applicants/miu-applicants-123e4567-e89b-42d3-a456-426614174000';
const url = `https://res.cloudinary.com/${cloudName}/image/upload/v1730000000/${publicId}.jpg`;
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

test('Cloudinary URL resolves to the uploaded public ID with or without a version segment', () => {
  assert.equal(publicIdFromCloudinaryUrl(url, cloudName), publicId);
  assert.equal(publicIdFromCloudinaryUrl(`https://res.cloudinary.com/${cloudName}/image/upload/${publicId}.jpeg`, cloudName), publicId);
  assert.equal(publicIdFromCloudinaryUrl(`http://res.cloudinary.com/${cloudName}/image/upload/${publicId}.jpg`, cloudName), null);
  assert.equal(publicIdFromCloudinaryUrl(`https://example.com/${cloudName}/image/upload/${publicId}.jpg`, cloudName), null);
});

test('public image verification accepts a matching JPEG without requiring Cloudinary Admin API access', async () => {
  let options;
  const result = await verifyPublicCloudinaryImage(url, publicId, cloudName, 1024, async (requestedUrl, requestOptions) => {
    assert.equal(requestedUrl, url);
    options = requestOptions;
    return new Response(jpeg, { headers: { 'content-type': 'image/jpeg', 'content-length': String(jpeg.length) } });
  });
  assert.deepEqual(result, { valid: true, format: 'jpeg', bytes: jpeg.length });
  assert.equal(options.redirect, 'error');
});

test('image verification rejects mismatched IDs, oversized bodies and non-image content', async () => {
  let fetchCalls = 0;
  const noFetch = async () => { fetchCalls += 1; throw new Error('unexpected fetch'); };
  assert.equal((await verifyPublicCloudinaryImage(url, 'miu-applicants/someone-else', cloudName, 1024, noFetch)).reason, 'invalid-reference');
  assert.equal(fetchCalls, 0);

  const tooLarge = await verifyPublicCloudinaryImage(url, publicId, cloudName, 4,
    async () => new Response(jpeg, { headers: { 'content-type': 'image/jpeg' } }));
  assert.equal(tooLarge.reason, 'file-too-large');

  const wrongType = await verifyPublicCloudinaryImage(url, publicId, cloudName, 1024,
    async () => new Response('not an image', { headers: { 'content-type': 'text/plain' } }));
  assert.equal(wrongType.reason, 'invalid-image');
});

test('Cloudinary signed upload response verifies the applicant photo without an outbound server request', () => {
  const version = '1730000000';
  const secret = 'test-secret';
  const signature = crypto.createHash('sha1').update(`public_id=${publicId}&version=${version}${secret}`).digest('hex');
  const cloudinaryUtils = { api_sign_request: (params, apiSecret) => crypto.createHash('sha1')
    .update(`public_id=${params.public_id}&version=${params.version}${apiSecret}`).digest('hex') };

  assert.equal(verifyCloudinaryUploadResponse(url, publicId, version, signature, 'miu-applicants', cloudName, secret, cloudinaryUtils), true);
  assert.equal(verifyCloudinaryUploadResponse(url, publicId, version, `${signature.slice(0, -1)}0`, 'miu-applicants', cloudName, secret, cloudinaryUtils), false);
  assert.equal(verifyCloudinaryUploadResponse(url.replace('.jpg', '.png'), publicId, version, signature, 'miu-applicants', cloudName, secret, cloudinaryUtils), true);
  assert.equal(verifyCloudinaryUploadResponse(url, publicId, 'invalid', signature, 'miu-applicants', cloudName, secret, cloudinaryUtils), false);
});
