function describeVisitorDevice(userAgent = '') {
  const agent = String(userAgent).toLowerCase();
  const deviceType = /ipad|tablet/.test(agent) ? 'tablet'
    : /mobile|iphone|ipod|android/.test(agent) ? 'mobile'
    : agent ? 'desktop' : 'unknown';
  const deviceName = /ipad/.test(agent) ? 'iPad'
    : /iphone/.test(agent) ? 'iPhone'
    : /ipod/.test(agent) ? 'iPod'
    : /android/.test(agent) ? (deviceType === 'tablet' ? 'Android tablet' : 'Android phone')
    : /windows/.test(agent) ? 'Windows computer'
    : /macintosh|mac os/.test(agent) ? 'Mac computer'
    : /linux/.test(agent) ? 'Linux computer'
    : 'Unknown device';
  const browserName = /edg\//.test(agent) ? 'Microsoft Edge'
    : /opr\//.test(agent) ? 'Opera'
    : /samsungbrowser\//.test(agent) ? 'Samsung Internet'
    : /firefox\//.test(agent) ? 'Firefox'
    : /chrome\//.test(agent) ? 'Chrome'
    : /safari\//.test(agent) ? 'Safari'
    : 'Unknown browser';
  return { deviceType, deviceName, browserName };
}

function createVisitorDeviceCode(visitorId) {
  return `DEV-${String(visitorId || '').slice(-8).toUpperCase()}`;
}

module.exports = { describeVisitorDevice, createVisitorDeviceCode };
