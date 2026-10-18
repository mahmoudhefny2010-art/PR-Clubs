(function installCloudinaryUpload() {
  const maxImageBytes = 10 * 1024 * 1024;
  const allowedImageTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);

  window.uploadImageToCloudinary = async function uploadImageToCloudinary(file, purpose) {
    if (!(file instanceof File) || !allowedImageTypes.has(file.type)) {
      throw new Error('Choose a PNG, JPG, or WebP image.');
    }
    if (file.size > maxImageBytes) throw new Error('Choose an image up to 10 MB.');

    const signatureResponse = await fetch('/api/uploads/cloudinary-signature', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purpose })
    });
    const signature = await signatureResponse.json().catch(() => ({}));
    if (!signatureResponse.ok) throw new Error(signature.message || 'Could not prepare the image upload.');

    const form = new FormData();
    form.append('file', file);
    form.append('api_key', signature.apiKey);
    form.append('timestamp', String(signature.timestamp));
    form.append('folder', signature.folder);
    form.append('public_id', signature.publicId);
    form.append('overwrite', 'false');
    form.append('signature', signature.signature);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(signature.cloudName)}/image/upload`, {
      method: 'POST',
      body: form
    });
    const uploaded = await response.json().catch(() => ({}));
    if (!response.ok || typeof uploaded.secure_url !== 'string' || typeof uploaded.public_id !== 'string'
      || typeof uploaded.signature !== 'string' || !uploaded.version) {
      throw new Error(uploaded.error?.message || 'The image could not be uploaded to Cloudinary.');
    }
    return { url: uploaded.secure_url, publicId: uploaded.public_id, signature: uploaded.signature, version: String(uploaded.version) };
  };
  window.uploadFeedVideo = async function uploadFeedVideo(file) {
    if (!(file instanceof File) || !['video/mp4', 'video/webm'].includes(file.type)) throw new Error('Choose an MP4 or WebM video.');
    if (!file.size || file.size > 50 * 1024 * 1024) throw new Error('Choose a video up to 50 MB.');
    const prepared = await fetch('/api/uploads/cloudinary-signature', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ purpose: 'feed', mediaType: 'video' }) });
    const signature = await prepared.json().catch(() => ({}));
    if (!prepared.ok) throw new Error(signature.message || 'Could not prepare the video upload.');
    const body = new FormData();
    body.append('file', file);
    for (const [key, value] of Object.entries({ api_key: signature.apiKey, timestamp: signature.timestamp, folder: signature.folder, public_id: signature.publicId, overwrite: 'false', signature: signature.signature })) body.append(key, String(value));
    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(signature.cloudName)}/video/upload`, { method: 'POST', body });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.secure_url || !result.public_id) throw new Error(result.error?.message || 'The video could not be uploaded.');
    return { url: result.secure_url, publicId: result.public_id };
  };
})();
