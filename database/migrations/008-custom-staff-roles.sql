SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID(N'dbo.CustomStaffRole',N'U') IS NULL
BEGIN
CREATE TABLE [dbo].[CustomStaffRole] (
  [key] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [name] NVARCHAR(80) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [description] NVARCHAR(300) COLLATE Latin1_General_100_BIN2 NULL,
  [enabled] BIT NULL,
  [version] FLOAT(53) NULL,
  [scope] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [updatedBy] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [_id] CHAR(24) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [createdAt] DATETIME2(3) NULL,
  [updatedAt] DATETIME2(3) NULL,
  [__v] FLOAT(53) NULL,
  [_payload] NVARCHAR(MAX) NOT NULL CHECK (ISJSON([_payload]) = 1),
  [_version] BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT [PK_CustomStaffRole] PRIMARY KEY ([_id]),
  CHECK ([scope] IS NULL OR [scope] IN (N'global', N'clubs')),
  CHECK ([_id] IS NULL OR (LEN([_id]) = 24 AND [_id] NOT LIKE '%[^0-9a-f]%'))
);
CREATE UNIQUE NONCLUSTERED INDEX [IX_CustomStaffRole_0_b781d5] ON [dbo].[CustomStaffRole] ([key] ASC);
END;
IF DATABASE_PRINCIPAL_ID(N'miu_runtime_v1') IS NOT NULL GRANT SELECT,INSERT,UPDATE,DELETE ON OBJECT::[dbo].[CustomStaffRole] TO [miu_runtime_v1];
DECLARE @roleChecks NVARCHAR(MAX)=N'';
SELECT @roleChecks=@roleChecks+N'ALTER TABLE [dbo].[ClubAccount] DROP CONSTRAINT '+QUOTENAME([name])+N';'
FROM sys.check_constraints AS c WHERE parent_object_id=OBJECT_ID(N'dbo.ClubAccount') AND (
  c.parent_column_id=COLUMNPROPERTY(c.parent_object_id,N'role',N'ColumnId')
  OR c.[name] IN (N'CK_ClubAccount_Role',N'CK_ClubAccount_StaffRole')
  OR EXISTS (SELECT 1 FROM sys.sql_expression_dependencies AS d WHERE d.referencing_id=c.object_id AND d.referenced_id=c.parent_object_id AND d.referenced_minor_id=COLUMNPROPERTY(c.parent_object_id,N'role',N'ColumnId'))
);
IF LEN(@roleChecks)>0 EXEC sys.sp_executesql @roleChecks;
ALTER TABLE [dbo].[ClubAccount] WITH CHECK ADD CONSTRAINT [CK_ClubAccount_StaffRole]
CHECK ([role] IN (N'president',N'vice_president',N'head',N'pr',N'english',N'security',N'sso',N'dean',N'supervisor',N'miu_events',N'software_development') OR ([role] LIKE N'custom[_]%' AND LEN([role]) BETWEEN 8 AND 37 AND [role] NOT LIKE N'%[^a-z_]%' COLLATE Latin1_General_100_BIN2));
COMMIT TRANSACTION;
