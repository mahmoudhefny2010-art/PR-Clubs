SET XACT_ABORT ON;
BEGIN TRANSACTION;
DECLARE @tableId INT = OBJECT_ID(N'dbo.SpeakerInvite');
IF @tableId IS NULL THROW 51000, 'SpeakerInvite table is missing.', 1;
DECLARE @checks TABLE (name SYSNAME);
INSERT INTO @checks
SELECT name FROM sys.check_constraints
WHERE parent_object_id = @tableId
  AND CHARINDEX(N'[createdByRole]', definition) > 0
  AND definition LIKE N'%''president''%'
  AND definition LIKE N'%''head''%'
;
DECLARE @existing SYSNAME;
WHILE EXISTS (SELECT 1 FROM @checks)
BEGIN
  SELECT TOP (1) @existing = name FROM @checks;
  DECLARE @drop NVARCHAR(MAX) = N'ALTER TABLE [dbo].[SpeakerInvite] DROP CONSTRAINT ' + QUOTENAME(@existing);
  EXEC sys.sp_executesql @drop;
  DELETE FROM @checks WHERE name = @existing;
END;
ALTER TABLE [dbo].[SpeakerInvite] WITH CHECK ADD CONSTRAINT [CK_SpeakerInvite_Role]
  CHECK ([createdByRole] IS NULL OR [createdByRole] IN (N'president', N'head', N'dean', N'supervisor'));
ALTER TABLE [dbo].[SpeakerInvite] CHECK CONSTRAINT [CK_SpeakerInvite_Role];
COMMIT TRANSACTION;
