(() => {
  'use strict';

  function isFinder(row, column, count) {
    return row < 8 && column < 8 || row < 8 && column >= count - 8 || row >= count - 8 && column < 8;
  }

  function drawCapsule(context, x, y, width, height, angle) {
    context.save();
    context.translate(x, y);
    context.rotate(angle);
    const radius = height / 2;
    context.beginPath();
    context.moveTo(-width / 2 + radius, -height / 2);
    context.arcTo(width / 2, -height / 2, width / 2, height / 2, radius);
    context.arcTo(width / 2, height / 2, -width / 2, height / 2, radius);
    context.arcTo(-width / 2, height / 2, -width / 2, -height / 2, radius);
    context.arcTo(-width / 2, -height / 2, width / 2, -height / 2, radius);
    context.closePath();
    context.fill();
    context.restore();
  }

  function drawLogo(context, logo, label, center, diameter) {
    context.save();
    context.beginPath();
    context.arc(center, center, diameter / 2, 0, Math.PI * 2);
    context.fillStyle = '#ffffff';
    context.fill();
    context.lineWidth = Math.max(2, diameter * 0.045);
    context.strokeStyle = '#d9dee7';
    context.stroke();
    context.beginPath();
    context.arc(center, center, diameter * 0.405, 0, Math.PI * 2);
    context.clip();

    const drawFallback = () => {
      const initials = (label || 'MIU').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
      context.fillStyle = '#14243b';
      context.font = `700 ${Math.round(diameter * 0.27)}px Arial, sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(initials || 'MIU', center, center);
    };
    if (!logo) { drawFallback(); context.restore(); return Promise.resolve(); }

    return new Promise(resolve => {
      const image = new Image();
      image.onload = () => {
        const inset = diameter * 0.19;
        const available = diameter - inset * 2;
        const scale = Math.min(available / image.naturalWidth, available / image.naturalHeight);
        const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
        context.drawImage(image, center - width / 2, center - height / 2, width, height);
        context.restore();
        resolve();
      };
      image.onerror = () => { drawFallback(); context.restore(); resolve(); };
      image.src = logo;
    });
  }

  async function renderAttendanceQr(container, value, options = {}) {
    if (!container || !value) throw new Error('Attendance QR data is missing.');
    await window.ensureQRCode();
    const size = Math.max(240, Number(options.size) || 336);
    const staging = document.createElement('div');
    staging.setAttribute('aria-hidden', 'true');
    staging.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px;overflow:hidden';
    document.body.append(staging);
    let model;
    try {
      const qr = new window.QRCode(staging, {
        text: value, width: size, height: size, colorDark: '#101820', colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.H
      });
      model = qr._oQRCode;
      if (!model || typeof model.getModuleCount !== 'function' || typeof model.isDark !== 'function') throw new Error('The QR generator does not expose its scan-safe matrix.');
    } finally { staging.remove(); }

    const count = model.getModuleCount(), canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size; canvas.className = 'attendance-qr-art';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', options.alt || 'Rotating attendance QR code');
    const context = canvas.getContext('2d'), inset = size * 0.09, cell = (size - inset * 2) / count, center = size / 2;
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, size, size);
    for (let row = 0; row < count; row++) for (let column = 0; column < count; column++) {
      if (!model.isDark(row, column)) continue;
      const x = inset + (column + 0.5) * cell, y = inset + (row + 0.5) * cell;
      if (isFinder(row, column, count)) {
        context.fillStyle = '#101820'; context.fillRect(inset + column * cell, inset + row * cell, Math.ceil(cell), Math.ceil(cell));
        continue;
      }
      const dx = x - center, dy = y - center, tangent = Math.atan2(dy, dx) + Math.PI / 2;
      const band = Math.floor(Math.hypot(dx, dy) / Math.max(cell * 3.8, 1));
      const segment = Math.floor((Math.atan2(dy, dx) + Math.PI) * 8 / (Math.PI * 2));
      context.fillStyle = (band + segment) % 5 === 0 ? '#626b75' : '#101820';
      drawCapsule(context, x, y, cell * 0.88, cell * 0.52, tangent);
    }
    container.replaceChildren(canvas);
    await drawLogo(context, options.logo, options.label, center, size * 0.16);
    return canvas;
  }

  window.renderAttendanceQr = renderAttendanceQr;
})();
