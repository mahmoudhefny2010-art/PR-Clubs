const test = require('node:test');
const assert = require('node:assert/strict');
const { describeVisitorDevice, createVisitorDeviceCode } = require('../services/visitor-device');

test('identifies an iPhone Safari browser without retaining the raw user agent', () => {
  assert.deepEqual(describeVisitorDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1'), {
    deviceType: 'mobile', deviceName: 'iPhone', browserName: 'Safari'
  });
});

test('identifies Android phones and Chrome', () => {
  assert.deepEqual(describeVisitorDevice('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36'), {
    deviceType: 'mobile', deviceName: 'Android phone', browserName: 'Chrome'
  });
});

test('identifies tablets and gives Edge precedence over its Chromium engine', () => {
  assert.deepEqual(describeVisitorDevice('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1 Edg/120.0'), {
    deviceType: 'tablet', deviceName: 'iPad', browserName: 'Microsoft Edge'
  });
});

test('identifies desktop operating systems and safely handles missing user agents', () => {
  assert.deepEqual(describeVisitorDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36'), {
    deviceType: 'desktop', deviceName: 'Windows computer', browserName: 'Chrome'
  });
  assert.deepEqual(describeVisitorDevice(), {
    deviceType: 'unknown', deviceName: 'Unknown device', browserName: 'Unknown browser'
  });
});

test('formats a short stable browser code from the protected visitor identifier', () => {
  assert.equal(createVisitorDeviceCode('a'.repeat(56) + '3a91bc72'), 'DEV-3A91BC72');
});
