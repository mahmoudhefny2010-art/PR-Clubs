SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID(N'dbo.WorkflowDefinition',N'U') IS NULL
BEGIN
CREATE TABLE [dbo].[WorkflowDefinition] (
  [type] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [version] FLOAT(53) NOT NULL,
  [updatedBy] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [_id] CHAR(24) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [createdAt] DATETIME2(3) NULL,
  [updatedAt] DATETIME2(3) NULL,
  [__v] FLOAT(53) NULL,
  [_payload] NVARCHAR(MAX) NOT NULL CHECK (ISJSON([_payload]) = 1),
  [_version] BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT [PK_WorkflowDefinition] PRIMARY KEY ([_id]),
  CHECK ([_id] IS NULL OR (LEN([_id]) = 24 AND [_id] NOT LIKE '%[^0-9a-f]%'))
);
CREATE UNIQUE NONCLUSTERED INDEX [IX_WorkflowDefinition_0_e126f1] ON [dbo].[WorkflowDefinition] ([type] ASC);
END;
IF DATABASE_PRINCIPAL_ID(N'miu_runtime_v1') IS NOT NULL GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::[dbo].[WorkflowDefinition] TO [miu_runtime_v1];
IF OBJECT_ID(N'dbo.WorkflowNotification',N'U') IS NULL
BEGIN
CREATE TABLE [dbo].[WorkflowNotification] (
  [eventKey] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [recipientEmail] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [kind] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [requestRef] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [title] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [message] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [link] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [readAt] DATETIME2(3) NULL,
  [emailStatus] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NULL,
  [attempts] FLOAT(53) NULL,
  [nextAttemptAt] DATETIME2(3) NULL,
  [leaseUntil] DATETIME2(3) NULL,
  [leaseId] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [providerMessageId] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [errorCode] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [_id] CHAR(24) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [createdAt] DATETIME2(3) NULL,
  [updatedAt] DATETIME2(3) NULL,
  [__v] FLOAT(53) NULL,
  [_payload] NVARCHAR(MAX) NOT NULL CHECK (ISJSON([_payload]) = 1),
  [_version] BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT [PK_WorkflowNotification] PRIMARY KEY ([_id]),
  CHECK ([emailStatus] IS NULL OR [emailStatus] IN (N'pending', N'sending', N'sent', N'failed', N'unconfigured')),
  CHECK ([_id] IS NULL OR (LEN([_id]) = 24 AND [_id] NOT LIKE '%[^0-9a-f]%'))
);
CREATE UNIQUE NONCLUSTERED INDEX [IX_WorkflowNotification_0_701d7a] ON [dbo].[WorkflowNotification] ([eventKey] ASC);
CREATE NONCLUSTERED INDEX [IX_WorkflowNotification_1_83ba78] ON [dbo].[WorkflowNotification] ([recipientEmail] ASC);
CREATE NONCLUSTERED INDEX [IX_WorkflowNotification_2_d550b5] ON [dbo].[WorkflowNotification] ([emailStatus] ASC);
END;
IF DATABASE_PRINCIPAL_ID(N'miu_runtime_v1') IS NOT NULL GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::[dbo].[WorkflowNotification] TO [miu_runtime_v1];
COMMIT TRANSACTION;
