function getCloudinaryCredentials(env = process.env) {
  if (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) {
    return { cloud_name: env.CLOUDINARY_CLOUD_NAME, api_key: env.CLOUDINARY_API_KEY, api_secret: env.CLOUDINARY_API_SECRET };
  }
  try {
    const url = new URL(env.CLOUDINARY_URL || '');
    if (url.protocol !== 'cloudinary:' || !url.hostname || !url.username || !url.password) return null;
    return { cloud_name: url.hostname, api_key: decodeURIComponent(url.username), api_secret: decodeURIComponent(url.password) };
  } catch { return null; }
}
module.exports = { getCloudinaryCredentials };
