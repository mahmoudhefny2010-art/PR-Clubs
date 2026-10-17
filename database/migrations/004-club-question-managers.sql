SET XACT_ABORT ON;
BEGIN TRANSACTION;
DECLARE @tableId INT = OBJECT_ID(N'dbo.ClubAccount');
IF @tableId IS NULL THROW 51000, 'ClubAccount table is missing.', 1;
DECLARE @checks TABLE (name SYSNAME);
INSERT INTO @checks
SELECT name FROM sys.check_constraints
WHERE parent_object_id = @tableId
  AND CHARINDEX(N'[role]', definition) > 0
  AND definition LIKE N'%''president''%'
  AND definition LIKE N'%''head''%'
  AND definition LIKE N'%''supervisor''%';
DECLARE @existing SYSNAME;
WHILE EXISTS (SELECT 1 FROM @checks)
BEGIN
  SELECT TOP (1) @existing = name FROM @checks;
  DECLARE @drop NVARCHAR(MAX) = N'ALTER TABLE [dbo].[ClubAccount] DROP CONSTRAINT ' + QUOTENAME(@existing);
  EXEC sys.sp_executesql @drop;
  DELETE FROM @checks WHERE name = @existing;
END;
ALTER TABLE [dbo].[ClubAccount] WITH CHECK ADD CONSTRAINT [CK_ClubAccount_Role]
  CHECK ([role] IS NULL OR [role] IN (N'president', N'vice_president', N'head', N'pr', N'english', N'security', N'sso', N'dean', N'supervisor', N'miu_events', N'software_development'));
ALTER TABLE [dbo].[ClubAccount] CHECK CONSTRAINT [CK_ClubAccount_Role];
COMMIT TRANSACTION;
