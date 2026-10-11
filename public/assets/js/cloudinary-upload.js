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
    if (!response.ok || typeof uploaded.secure_url !== 'string' || typeof uploaded.public_id !== 'string') {
      throw new Error(uploaded.error?.message || 'The image could not be uploaded to Cloudinary.');
    }
    return { url: uploaded.secure_url, publicId: uploaded.public_id };
  };
})();
