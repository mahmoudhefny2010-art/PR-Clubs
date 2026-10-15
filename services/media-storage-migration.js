const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { get } = require('../database/values');
const modelFields = {
  Club: 'image imagePublicId events posts sponsors booths interviewForms memberRoster',
  Application: 'photo photoPublicId answers interviewEvaluations',
  UniversityContent: 'image imagePublicId',
  ContentRequest: 'image sponsorLogo type status',
  AccountPhoto: 'url publicId'
};
const mediaKeys = new Set(['image', 'photo', 'sponsorLogo', 'logo', 'avatar', 'video', 'poster', 'thumbnail']);
const digest = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
function fail(code) { throw Object.assign(new Error(code), { code }); }
function ownCloudinary(source, cloudName) {
  try { const url = new URL(source); return url.protocol === 'https:' && url.hostname === 'res.cloudinary.com' && url.pathname.startsWith('/' + cloudName + '/'); }
  catch { return false; }
}
function collectReferences(model, record) {
  const refs = [];
  function walk(value, keys = []) {
    if (Array.isArray(value)) { value.forEach((v, i) => walk(v, [...keys, String(i)])); return; }
    if (value && typeof value === 'object') { for (const [key, v] of Object.entries(value)) if (key !== '_id') walk(v, [...keys, key]); return; }
    const key = keys.at(-1);
    if (typeof value !== 'string' || !value || (!mediaKeys.has(key) && !(model === 'AccountPhoto' && key === 'url'))) return;
    if (/^data:(?!image\/|video\/)/i.test(value)) return;
    refs.push({ model, id: String(record._id), path: keys.join('.'), source: value, contentType: record.type || '', contentStatus: record.status || '' });
  }
  walk(record);
  return refs;
}
function mediaKind(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return { resourceType: 'image', mime: 'image/png', format: 'png' };
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return { resourceType: 'image', mime: 'image/jpeg', format: 'jpg' };
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return { resourceType: 'image', mime: 'image/webp', format: 'webp' };
  if (/^GIF8[79]a$/.test(bytes.toString('ascii', 0, 6))) return { resourceType: 'image', mime: 'image/gif', format: 'gif' };
  if (bytes.toString('ascii', 4, 8) === 'ftyp') return { resourceType: 'video', mime: 'video/mp4', format: 'mp4' };
  if (bytes.subarray(0, 4).equals(Buffer.from([26,69,223,163]))) return { resourceType: 'video', mime: 'video/webm', format: 'webm' };
  fail('UNSUPPORTED_MEDIA_SIGNATURE');
}
async function loadSource(source, publicRoot) {
  let bytes;
  if (source.startsWith('data:')) {
    const match = /^data:(image\/(?:png|jpe?g|webp|gif)|video\/(?:mp4|webm));base64,([A-Za-z0-9+/]*={0,2})$/.exec(source);
    if (!match || match[2].length > Math.ceil(50 * 1024 * 1024 / 3) * 4) fail('INVALID_INLINE_MEDIA');
    bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.toString('base64') !== match[2]) fail('INVALID_INLINE_MEDIA');
  } else {
    if (!/^\/?assets\//.test(source)) fail('UNSUPPORTED_MEDIA_SOURCE');
    let decoded;
    try { decoded = decodeURIComponent(source.split(/[?#]/)[0]); } catch { fail('INVALID_LOCAL_MEDIA_PATH'); }
    const allowed = await fs.realpath(path.join(publicRoot, 'assets'));
    const file = path.resolve(publicRoot, '.' + (decoded.startsWith('/') ? decoded : '/' + decoded));
    const relative = path.relative(allowed, file);
    if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) fail('INVALID_LOCAL_MEDIA_PATH');
    const stat = await fs.lstat(file), actual = await fs.realpath(file);
    const actualRelative = path.relative(allowed, actual);
    if (!stat.isFile() || stat.isSymbolicLink() || actualRelative === '..' || actualRelative.startsWith('..' + path.sep) || path.isAbsolute(actualRelative)) fail('INVALID_LOCAL_MEDIA_PATH');
    if (stat.size > 50 * 1024 * 1024) fail('MEDIA_TOO_LARGE');
    bytes = await fs.readFile(actual);
  }
  const kind = mediaKind(bytes);
  if (bytes.length > (kind.resourceType === 'video' ? 50 : 10) * 1024 * 1024) fail('MEDIA_TOO_LARGE');
  return { bytes, sha256: digest(bytes), ...kind };
}
function folderFor(ref, resourceType) {
  if (['Application', 'AccountPhoto'].includes(ref.model)) return 'miu-applicants';
  if (ref.model === 'UniversityContent') return 'miu-university-content';
  if (resourceType === 'video' || ref.path.startsWith('posts.') || ref.contentType === 'feed') return 'miu-feed-media';
  return 'miu-clubs';
}
function publicIdPath(ref) {
  if (ref.model === 'Application' && ref.path === 'photo') return 'photoPublicId';
  if (ref.model === 'AccountPhoto' && ref.path === 'url') return 'publicId';
  if (['Club', 'UniversityContent'].includes(ref.model) && ref.path === 'image') return 'imagePublicId';
  return null;
}
async function makePlan(models, { cloudName, publicRoot }) {
  const references = [], assets = new Map(), errors = [], sources = new Map();
  let existingCloudReferences = 0;
  for (const [name, fields] of Object.entries(modelFields)) {
    const records = await models[name].find().select(fields).lean();
    for (const record of records) for (const ref of collectReferences(name, record)) {
      if (ownCloudinary(ref.source, cloudName)) { existingCloudReferences++; continue; }
      try {
        if (!sources.has(ref.source)) sources.set(ref.source, await loadSource(ref.source, publicRoot));
        const media = sources.get(ref.source), folder = folderFor(ref, media.resourceType);
        const key = `${folder}:${media.resourceType}:${media.sha256}`;
        if (!assets.has(key)) assets.set(key, { key, folder, ...media });
        const idPath = publicIdPath(ref);
        references.push({ ...ref, assetKey: key, publicIdPath: idPath, previousPublicId: idPath ? get(record, idPath) : undefined });
      } catch (error) { errors.push({ model: name, id: String(record._id), path: ref.path, code: error.code || 'MEDIA_READ_FAILED' }); }
    }
  }
  return { references, assets: [...assets.values()], errors, existingCloudReferences };
}
function isPrivateReference(ref) {
  return ['Application', 'AccountPhoto'].includes(ref.model)
    || ref.model === 'ContentRequest' && ref.contentStatus !== 'published'
    || ref.model === 'Club' && /^(?:interviewForms|memberRoster)\./.test(ref.path);
}
function publicPlan(plan) {
  const references = plan.references.filter(ref => !isPrivateReference(ref));
  const keys = new Set(references.map(ref => ref.assetKey));
  return { ...plan, references, assets: plan.assets.filter(asset => keys.has(asset.key)),
    excludedPrivateReferences: plan.references.length - references.length };
}
function summarize(plan) {
  const byModel = {};
  for (const ref of plan.references) byModel[ref.model] = (byModel[ref.model] || 0) + 1;
  const privateReferences = plan.references.filter(isPrivateReference).length;
  return { referencesToMigrate: plan.references.length, privateReferences, uniqueUploads: plan.assets.length, bytesToUpload: plan.assets.reduce((n, a) => n + a.bytes.length, 0), images: plan.assets.filter(a => a.resourceType === 'image').length, videos: plan.assets.filter(a => a.resourceType === 'video').length, existingCloudReferences: plan.existingCloudReferences, byModel, errors: plan.errors };
}
async function uploadAsset(cloudinary, asset, cloudName) {
  const result = await cloudinary.uploader.upload(`data:${asset.mime};base64,${asset.bytes.toString('base64')}`, {
    resource_type: asset.resourceType, folder: asset.folder,
    public_id: `${asset.folder}-migration-${asset.sha256.slice(0, 40)}`, overwrite: false, unique_filename: false, timeout: 60000
  });
  if (!ownCloudinary(result.secure_url, cloudName) || result.resource_type !== asset.resourceType || !result.public_id?.startsWith(asset.folder + '/')) fail('CLOUDINARY_UPLOAD_MISMATCH');
  const verified = await cloudinary.api.resource(result.public_id, { resource_type: asset.resourceType, type: 'upload', timeout: 30000 });
  if (verified.bytes !== asset.bytes.length || verified.secure_url !== result.secure_url) fail('CLOUDINARY_RESOURCE_MISMATCH');
  const response = await fetch(result.secure_url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) fail('CLOUDINARY_DELIVERY_FAILED');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (digest(bytes) !== asset.sha256) fail('CLOUDINARY_CHECKSUM_MISMATCH');
  return { url: result.secure_url, publicId: result.public_id, resourceType: asset.resourceType, sha256: asset.sha256, bytes: asset.bytes.length };
}
function changesFor(plan, uploads) {
  const records = new Map();
  for (const ref of plan.references) {
    const upload = uploads[ref.assetKey];
    if (!upload) fail('MISSING_VERIFIED_UPLOAD');
    const key = ref.model + ':' + ref.id;
    if (!records.has(key)) records.set(key, { model: ref.model, id: ref.id, fields: [] });
    const fields = records.get(key).fields;
    fields.push({ path: ref.path, before: ref.source, after: upload.url });
    if (ref.publicIdPath) fields.push({ path: ref.publicIdPath, before: ref.previousPublicId ?? null, absentBefore: ref.previousPublicId === undefined, after: upload.publicId });
  }
  return [...records.values()];
}
async function applyChanges(models, changes, session, { rollback = false } = {}) {
  // The caller starts the SQL transaction/app write lock. Explicitly pass the
  // same session for every read and write; no network uploads occur here.
  for (const entry of changes) {
    const model = models[entry.model];
    if (!model || !Object.hasOwn(modelFields, entry.model)) fail('INVALID_MIGRATION_MODEL');
    const record = await model.findById(entry.id).session(session).lean();
    if (!record) fail('MEDIA_RECORD_MISSING');
    const updates = {}, unset = {};
    for (const field of entry.fields) {
      const expected = rollback ? field.after : field.absentBefore ? undefined : field.before;
      if (get(record, field.path) !== expected) fail('MEDIA_CHANGED_SINCE_PLAN');
      if (rollback && field.absentBefore) unset[field.path] = '';
      else updates[field.path] = rollback ? field.before : field.after;
    }
    const operation = { $set: updates, ...(Object.keys(unset).length ? { $unset: unset } : {}) };
    const result = await model.updateOne({ _id: entry.id }, operation, { session, timestamps: false });
    if (result.matchedCount !== 1) fail('MEDIA_UPDATE_NOT_CONFIRMED');
    const saved = await model.findById(entry.id).session(session).lean();
    for (const field of entry.fields) if (get(saved, field.path) !== (rollback ? field.absentBefore ? undefined : field.before : field.after)) fail('MEDIA_READBACK_MISMATCH');
  }
}
module.exports = { modelFields, collectReferences, loadSource, folderFor, makePlan, publicPlan, summarize, uploadAsset, changesFor, applyChanges, ownCloudinary };
