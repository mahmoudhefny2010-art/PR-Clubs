const runtime = require('./runtime');
const { metadata, serialize } = require('../services/public-content-pagination');

// Flatten published JSON arrays inside SQL Server. Only the selected page crosses
// the connection; original array indexes remain intact for registration/media URLs.
function pageQuery(o) {
  const collections = o.section === 'feed' ? ['events', 'posts'] : o.section === 'updates' ? ['posts'] : [o.section];
  if (collections.some(name => !['events', 'posts', 'sponsors', 'booths'].includes(name))) throw new Error('Invalid content section.');
  const clubSources = collections.map(collection => `SELECT c.id AS clubId, c.name AS clubName,
    c.updatedAt, c._version AS sourceVersion, CAST(0 AS BIT) AS university, '${collection}' AS collection, TRY_CONVERT(INT,a.[key]) AS [index], a.[value] AS item
    FROM dbo.Club c CROSS APPLY OPENJSON(c._payload, '$.${collection}') a
    WHERE c.archivedAt IS NULL AND a.[type]=5 ${o.clubId ? 'AND c.id=@clubId' : ''}`);
  if (['feed', 'events', 'updates'].includes(o.section) && !o.clubId) clubSources.push(`SELECT 0, N'Misr International University',
    NULL, u._version, CAST(1 AS BIT), CASE WHEN JSON_VALUE(u._payload,'$.type')='event' THEN 'events' ELSE 'posts' END, u.id, u._payload
    FROM dbo.UniversityContent u WHERE u.[type] ${o.section === 'events' ? "= 'event'" : o.section === 'updates' ? "= 'announcement'" : "IN ('event','announcement')"}`);
  const where = [];
  if (o.section === 'events') where.push('(university=1 OR eventDate IS NOT NULL)');
  if (o.section === 'feed') {
    where.push(`(university=1 OR (collection='events' AND eventDate IS NOT NULL AND LEN(LTRIM(RTRIM(ISNULL(title,''))))>0)
      OR (collection='posts' AND LEN(LTRIM(RTRIM(CONCAT(title,bodyText,description))))>0))`);
    if (o.filter === 'events') where.push("collection='events' AND (eventDate>=TRY_CONVERT(DATETIMEOFFSET,@today) OR (university=1 AND eventDate IS NULL))");
    if (o.filter === 'announcements') where.push("collection='posts' AND announcement=1");
    if (o.filter === 'activities') where.push("collection='posts' AND announcement=0");
  }
  if (o.section === 'updates') where.push('published IS NOT NULL');
  where.push("(@q=N'' OR CHARINDEX(LOWER(@q), LOWER(CONCAT(title,N' ',bodyText,N' ',description,N' ',clubName)))>0)");
  const ordering = o.section === 'events' ? 'published DESC'
    : o.section === 'booths' ? 'CASE WHEN opening IS NULL THEN 1 ELSE 0 END, opening, created DESC, requestId DESC'
      : o.section === 'sponsors' ? 'created DESC, requestId DESC' : 'published DESC';
  // JSON cardinality estimates can request excessive workspace memory on small
  // SQL instances. Bound the grant and avoid parallel exchange buffers; larger
  // sorts can spill to tempdb instead of leaving public requests queued.
  return `;WITH source AS (${clubSources.join('\nUNION ALL\n')}), fields AS (
    SELECT s.*, f.*, TRY_CONVERT(BIGINT,f.rawRequestId) AS requestId,
    TRY_CONVERT(DATETIMEOFFSET,COALESCE(NULLIF(f.date,''),f.dateExtended)) AS eventDate,
    TRY_CONVERT(DATETIMEOFFSET,COALESCE(NULLIF(f.createdAt,''),f.createdAtExtended)) AS created,
    TRY_CONVERT(DATETIMEOFFSET,COALESCE(NULLIF(f.publishedAt,''),f.publishedAtExtended,NULLIF(f.createdAt,''),f.createdAtExtended,NULLIF(f.submittedAt,''),f.submittedAtExtended,NULLIF(f.date,''),f.dateExtended)) AS published,
    TRY_CONVERT(DATETIMEOFFSET,COALESCE(NULLIF(f.boothOpenDate,''),f.boothOpenDateExtended,NULLIF(f.date,''),f.dateExtended)) AS opening,
    CASE WHEN university=1 OR LOWER(COALESCE(f.[type],f.category,f.kind,'')) LIKE '%announcement%'
      OR LOWER(COALESCE(f.[type],f.category,f.kind,'')) LIKE '%notice%' THEN 1 ELSE 0 END AS announcement
    FROM source s CROSS APPLY OPENJSON(s.item) WITH (
      title NVARCHAR(MAX), bodyText NVARCHAR(MAX) '$.text', description NVARCHAR(MAX), date NVARCHAR(100),
      createdAt NVARCHAR(100), publishedAt NVARCHAR(100), submittedAt NVARCHAR(100), boothOpenDate NVARCHAR(100),
      dateExtended NVARCHAR(100) '$.date."$date"', createdAtExtended NVARCHAR(100) '$.createdAt."$date"',
      publishedAtExtended NVARCHAR(100) '$.publishedAt."$date"', submittedAtExtended NVARCHAR(100) '$.submittedAt."$date"', boothOpenDateExtended NVARCHAR(100) '$.boothOpenDate."$date"',
      [type] NVARCHAR(100), category NVARCHAR(100), kind NVARCHAR(100), rawRequestId NVARCHAR(100) '$.requestId') f)
    SELECT clubId, clubName, updatedAt, sourceVersion, university, collection, [index],
      ROW_NUMBER() OVER (ORDER BY ${ordering}, university, clubId, collection, [index]) AS position
      INTO #ContentPage FROM fields WHERE ${where.map(condition => `(${condition})`).join(' AND ')} OPTION (RECOMPILE, MAXDOP 1, MAX_GRANT_PERCENT = 1);
    DECLARE @total INT=(SELECT COUNT(*) FROM #ContentPage);
    DECLARE @pages INT=CEILING(CAST(@total AS FLOAT)/@pageSize);
    DECLARE @target BIGINT=(SELECT TOP(1) position FROM #ContentPage WHERE university=1 AND [index]=@post);
    DECLARE @current INT=CASE WHEN @target IS NOT NULL THEN CEILING(CAST(@target AS FLOAT)/@pageSize) ELSE @page END;
    SET @current=CASE WHEN @pages=0 THEN 1 WHEN @current>@pages THEN @pages ELSE @current END;
    SELECT @total AS totalItems, @current AS page;
    SELECT p.clubId, p.clubName, c.image AS clubImage, p.updatedAt, p.university, p.collection, p.[index],
      CASE WHEN p.university=1 THEN u._payload ELSE JSON_QUERY(c._payload, CONCAT('$.',p.collection,'[',p.[index],']')) END AS item FROM #ContentPage p
      LEFT JOIN dbo.Club c ON p.university=0 AND c.id=p.clubId AND c._version=p.sourceVersion
      LEFT JOIN dbo.UniversityContent u ON p.university=1 AND u.id=p.[index] AND u._version=p.sourceVersion
      WHERE position>(CAST(@current AS BIGINT)-1)*@pageSize AND position<=CAST(@current AS BIGINT)*@pageSize ORDER BY position OPTION (MAXDOP 1, MAX_GRANT_PERCENT = 1);
    DROP TABLE #ContentPage;`;
}
async function readPublicContentPage(o, attempt = 0) {
  const sql = runtime.driver();
  const result = await runtime.request().input('clubId', sql.BigInt, o.clubId).input('q', sql.NVarChar(200), o.q)
    .input('today', sql.NVarChar(10), o.today).input('page', sql.Int, o.page).input('pageSize', sql.Int, o.pageSize)
    .input('post', sql.BigInt, o.post).query(pageQuery(o));
  const summary = result.recordsets[0][0];
  if (result.recordsets[1].some(row => !row.item)) {
    if (attempt < 2) return readPublicContentPage(o, attempt + 1);
    throw new Error('Published content changed during pagination.');
  }
  return { items: result.recordsets[1].map(serialize), pagination: metadata(summary.totalItems, summary.page, o.pageSize) };
}
module.exports = { pageQuery, readPublicContentPage };
