const test = require('node:test');
const assert = require('node:assert/strict');
const { getVisitorIpAddress } = require('../services/visitor-network');
const { SiteVisitorPresence } = require('../models');

test('uses and validates the platform forwarded visitor IP', () => {
  assert.equal(getVisitorIpAddress({ headers: { 'x-vercel-forwarded-for': '203.0.113.8, 10.0.0.1' }, ip: '127.0.0.1' }), '203.0.113.8');
});

test('normalizes IPv4-mapped addresses from the request socket', () => {
  assert.equal(getVisitorIpAddress({ headers: {}, socket: { remoteAddress: '::ffff:192.0.2.14' } }), '192.0.2.14');
});

test('ignores malformed forwarded values and safely handles missing IPs', () => {
  assert.equal(getVisitorIpAddress({ headers: { 'x-forwarded-for': 'not-an-ip' }, ip: '' }), '');
  assert.equal(getVisitorIpAddress({ headers: {} }), '');
});

test('temporary visitor IP records have a MongoDB TTL expiry index', () => {
  assert.equal(SiteVisitorPresence.schema.path('expiresAt').options.index.expires, 0);
});
