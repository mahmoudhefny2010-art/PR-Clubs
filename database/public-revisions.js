const trackedModels = {
  Club: ['clubs'], Application: ['clubs'],
  UniversityContent: ['universityContent'], StudentFeedback: ['clubs', 'universityContent']
};

function notificationSchemaSql() {
  const statements = [
    `IF OBJECT_ID(N'dbo.PlatformPublicRevision', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[PlatformPublicRevision] (
    [id] INT NOT NULL PRIMARY KEY CHECK ([id] = 1),
    [epoch] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [clubs] BIGINT NOT NULL DEFAULT 0,
    [universityContent] BIGINT NOT NULL DEFAULT 0
  );
  INSERT INTO [dbo].[PlatformPublicRevision] ([id]) VALUES (1);
END;`
  ];
  for (const [model, keys] of Object.entries(trackedModels)) {
    const name = `TR_${model}_PublicRevision`;
    const body = `TRIGGER [dbo].[${name}] ON [dbo].[${model}] AFTER INSERT, UPDATE, DELETE AS
BEGIN
  SET NOCOUNT ON;
  IF NOT EXISTS (SELECT 1 FROM inserted) AND NOT EXISTS (SELECT 1 FROM deleted) RETURN;
  UPDATE [dbo].[PlatformPublicRevision] SET ${keys.map(key => `[${key}] = [${key}] + 1`).join(', ')} WHERE [id] = 1;
  IF @@ROWCOUNT <> 1 THROW 51000, 'Public revision state is missing.', 1;
END;`;
    const quote = value => "N'" + value.replaceAll("'", "''") + "'";
    statements.push(`IF OBJECT_ID(N'dbo.${name}', N'TR') IS NULL
  EXEC(${quote('CREATE ' + body)});
ELSE
  EXEC(${quote('ALTER ' + body)});`);
  }
  return statements.join('\n\n');
}

async function readPublicRevision(runtime) {
  const result = await runtime.request().query('SELECT CONVERT(VARCHAR(36), [epoch]) AS epoch, CONVERT(VARCHAR(20), [clubs]) AS clubs, CONVERT(VARCHAR(20), [universityContent]) AS universityContent FROM [dbo].[PlatformPublicRevision] WHERE [id] = 1;');
  const revision = result.recordset[0];
  if (!revision || !/^[a-f0-9-]{36}$/i.test(revision.epoch) || !/^\d+$/.test(revision.clubs) || !/^\d+$/.test(revision.universityContent)) throw new Error('SQL public revision state is unavailable.');
  return revision;
}

function changedPublicKeys(previous, current) {
  const keys = ['clubs', 'universityContent'];
  if (!previous || previous.epoch !== current.epoch) return keys;
  return keys.filter(key => previous[key] !== current[key]);
}

module.exports = { trackedModels, notificationSchemaSql, readPublicRevision, changedPublicKeys };
