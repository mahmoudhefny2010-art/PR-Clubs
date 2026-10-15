const MAX_FEED_VIDEO_BYTES = 50 * 1024 * 1024;
const FEED_MEDIA_FOLDER = 'miu-feed-media';
function looksLikeVideo(source) {
  return typeof source === 'string' && (/^data:video\//i.test(source) || /\/video\/(?:upload|authenticated|private)\//i.test(source));
}
async function validateFeedMedia(type, body, previous, { cloudinary, cloudName }) {
  const source = typeof body.image === 'string' ? body.image : previous || '';
  if (!looksLikeVideo(source)) return source;
  if (type !== 'feed') throw Object.assign(new Error('Videos are supported in feed posts only.'), { status: 400 });
  if (source === previous) return source;
  try {
    const url = new URL(source), publicId = body.videoPublicId;
    if (!cloudName || url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com'
      || !url.pathname.startsWith(`/${cloudName}/video/upload/`)
      || typeof publicId !== 'string' || !publicId.startsWith(`${FEED_MEDIA_FOLDER}/${FEED_MEDIA_FOLDER}-`)) throw new Error();
    const asset = await cloudinary.api.resource(publicId, { resource_type: 'video', type: 'upload' });
    if (asset.resource_type !== 'video' || !['mp4', 'webm'].includes(asset.format)
      || !Number.isFinite(asset.bytes) || asset.bytes <= 0 || asset.bytes > MAX_FEED_VIDEO_BYTES
      || asset.secure_url !== url.href) throw new Error();
    return url.href;
  } catch {
    throw Object.assign(new Error('Choose a valid MP4 or WebM video up to 50 MB and upload it again.'), { status: 400 });
  }
}
module.exports = { validateFeedMedia, MAX_FEED_VIDEO_BYTES, FEED_MEDIA_FOLDER };
