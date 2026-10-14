SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID(N'dbo.PlatformPublicRevision', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[PlatformPublicRevision] (
    [id] INT NOT NULL PRIMARY KEY CHECK ([id] = 1),
    [epoch] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [clubs] BIGINT NOT NULL DEFAULT 0,
    [universityContent] BIGINT NOT NULL DEFAULT 0
  );
  INSERT INTO [dbo].[PlatformPublicRevision] ([id]) VALUES (1);
END;

IF OBJECT_ID(N'dbo.TR_Club_PublicRevision', N'TR') IS NULL
  EXEC(N'CREATE TRIGGER [dbo].[TR_Club_PublicRevision] ON [dbo].[Club] AFTER INSERT, UPDATE, DELETE AS
BEGIN
  SET NOCOUNT ON;
  IF NOT EXISTS (SELECT 1 FROM inserted) AND NOT EXISTS (SELECT 1 FROM deleted) RETURN;
  UPDATE [dbo].[PlatformPublicRevision] SET [clubs] = [clubs] + 1 WHERE [id] = 1;
  IF @@ROWCOUNT <> 1 THROW 51000, ''Public revision state is missing.'', 1;
END;');
ELSE
  EXEC(N'ALTER TRIGGER [dbo].[TR_Club_PublicRevision] ON [dbo].[Club] AFTER INSERT, UPDATE, DELETE AS
BEGIN
  SET NOCOUNT ON;
  IF NOT EXISTS (SELECT 1 FROM inserted) AND NOT EXISTS (SELECT 1 FROM deleted) RETURN;
  UPDATE [dbo].[PlatformPublicRevision] SET [clubs] = [clubs] + 1 WHERE [id] = 1;
  IF @@ROWCOUNT <> 1 THROW 51000, ''Public revision state is missing.'', 1;
END;');

IF OBJECT_ID(N'dbo.TR_Application_PublicRevision', N'TR') IS NULL
  EXEC(N'CREATE TRIGGER [dbo].[TR_Application_PublicRevision] ON [dbo].[Application] AFTER INSERT, UPDATE, DELETE AS
BEGIN
  SET NOCOUNT ON;
  IF NOT EXISTS (SELECT 1 FROM inserted) AND NOT EXISTS (SELECT 1 FROM deleted) RETURN;
  UPDATE [dbo].[PlatformPublicRevision] SET [clubs] = [clubs] + 1 WHERE [id] = 1;
  IF @@ROWCOUNT <> 1 THROW 51000, ''Public revision state is missing.'', 1;
END;');
ELSE
  EXEC(N'ALTER TRIGGER [dbo].[TR_Application_PublicRevision] ON [dbo].[Application] AFTER INSERT, UPDATE, DELETE AS
BEGIN
  SET NOCOUNT ON;
  IF NOT EXISTS (SELECT 1 FROM inserted) AND NOT EXISTS (SELECT 1 FROM deleted) RETURN;
  UPDATE [dbo].[PlatformPublicRevision] SET [clubs] = [clubs] + 1 WHERE [id] = 1;
  IF @@ROWCOUNT <> 1 THROW 51000, ''Public revision state is missing.'', 1;
END;');

IF OBJECT_ID(N'dbo.TR_UniversityContent_PublicRevision', N'TR') IS NULL
  EXEC(N'CREATE TRIGGER [dbo].[TR_UniversityContent_PublicRevision] ON [dbo].[UniversityContent] AFTER INSERT, UPDATE, DELETE AS
BEGIN
  SET NOCOUNT ON;
  IF NOT EXISTS (SELECT 1 FROM inserted) AND NOT EXISTS (SELECT 1 FROM deleted) RETURN;
  UPDATE [dbo].[PlatformPublicRevision] SET [universityContent] = [universityContent] + 1 WHERE [id] = 1;
  IF @@ROWCOUNT <> 1 THROW 51000, ''Public revision state is missing.'', 1;
END;');
ELSE
  EXEC(N'ALTER TRIGGER [dbo].[TR_UniversityContent_PublicRevision] ON [dbo].[UniversityContent] AFTER INSERT, UPDATE, DELETE AS
BEGIN
  SET NOCOUNT ON;
  IF NOT EXISTS (SELECT 1 FROM inserted) AND NOT EXISTS (SELECT 1 FROM deleted) RETURN;
  UPDATE [dbo].[PlatformPublicRevision] SET [universityContent] = [universityContent] + 1 WHERE [id] = 1;
  IF @@ROWCOUNT <> 1 THROW 51000, ''Public revision state is missing.'', 1;
END;');

IF OBJECT_ID(N'dbo.TR_StudentFeedback_PublicRevision', N'TR') IS NULL
  EXEC(N'CREATE TRIGGER [dbo].[TR_StudentFeedback_PublicRevision] ON [dbo].[StudentFeedback] AFTER INSERT, UPDATE, DELETE AS
BEGIN
  SET NOCOUNT ON;
  IF NOT EXISTS (SELECT 1 FROM inserted) AND NOT EXISTS (SELECT 1 FROM deleted) RETURN;
  UPDATE [dbo].[PlatformPublicRevision] SET [clubs] = [clubs] + 1, [universityContent] = [universityContent] + 1 WHERE [id] = 1;
  IF @@ROWCOUNT <> 1 THROW 51000, ''Public revision state is missing.'', 1;
END;');
ELSE
  EXEC(N'ALTER TRIGGER [dbo].[TR_StudentFeedback_PublicRevision] ON [dbo].[StudentFeedback] AFTER INSERT, UPDATE, DELETE AS
BEGIN
  SET NOCOUNT ON;
  IF NOT EXISTS (SELECT 1 FROM inserted) AND NOT EXISTS (SELECT 1 FROM deleted) RETURN;
  UPDATE [dbo].[PlatformPublicRevision] SET [clubs] = [clubs] + 1, [universityContent] = [universityContent] + 1 WHERE [id] = 1;
  IF @@ROWCOUNT <> 1 THROW 51000, ''Public revision state is missing.'', 1;
END;');
COMMIT TRANSACTION;
