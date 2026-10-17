SET XACT_ABORT ON;
BEGIN TRANSACTION;
DECLARE @tableId INT = OBJECT_ID(N'dbo.Application');
IF @tableId IS NULL THROW 51000, 'Application table is missing.', 1;
DECLARE @checks TABLE (name SYSNAME);
INSERT INTO @checks
SELECT name FROM sys.check_constraints
WHERE parent_object_id = @tableId
  AND CHARINDEX(N'[status]', definition) > 0
  AND definition LIKE N'%''pending''%'
  AND definition LIKE N'%''accepted''%'
  AND definition LIKE N'%''rejected''%';
DECLARE @existing SYSNAME;
WHILE EXISTS (SELECT 1 FROM @checks)
BEGIN
  SELECT TOP (1) @existing = name FROM @checks;
  DECLARE @drop NVARCHAR(MAX) = N'ALTER TABLE [dbo].[Application] DROP CONSTRAINT ' + QUOTENAME(@existing);
  EXEC sys.sp_executesql @drop;
  DELETE FROM @checks WHERE name = @existing;
END;
ALTER TABLE [dbo].[Application] WITH CHECK ADD CONSTRAINT [CK_Application_Status]
  CHECK ([status] IS NULL OR [status] IN (N'pending', N'accepted', N'rejected', N'removed'));
ALTER TABLE [dbo].[Application] CHECK CONSTRAINT [CK_Application_Status];
COMMIT TRANSACTION;
