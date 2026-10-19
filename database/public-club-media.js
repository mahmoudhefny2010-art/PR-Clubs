const runtime = require('./runtime');

function mediaQuery({ clubId, collection, index, field, version }) {
  if (!['events', 'posts', 'sponsors', 'booths'].includes(collection) || !['image', 'sponsorLogo'].includes(field)
    || !Number.isSafeInteger(clubId) || clubId < 1 || !Number.isSafeInteger(index) || index < 0
    || !Number.isSafeInteger(version) || version < 0 || !Number.isFinite(new Date(version).getTime())) {
    throw new Error('Invalid public media reference.');
  }
  // OPENJSON WITH NVARCHAR(MAX) preserves base64 strings longer than 4,000
  // characters and transfers only this asset, instead of the whole club payload.
  const mediaPath = `$."${collection}"[${index}]."${field}"`;
  return `SELECT media.[value]
FROM [dbo].[Club]
CROSS APPLY OPENJSON([_payload]) WITH ([value] NVARCHAR(MAX) '${mediaPath}') media
WHERE [id] = @clubId AND [archivedAt] IS NULL
AND ([updatedAt] = @updatedAt OR ([updatedAt] IS NULL AND @updatedAt IS NULL));`;
}

async function readPublicClubMedia(reference) {
  const query = mediaQuery(reference);
  const sql = runtime.driver();
  const result = await runtime.request()
    .input('clubId', sql.BigInt, reference.clubId)
    .input('updatedAt', sql.DateTime2(3), reference.version ? new Date(reference.version) : null)
    .query(query);
  return result.recordset[0]?.value;
}
module.exports = { mediaQuery, readPublicClubMedia };
