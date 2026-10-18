-- Add quiz analytics storage to existing SQL databases.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID(N'dbo.QuizSubmission', N'U') IS NULL
BEGIN
CREATE TABLE [dbo].[QuizSubmission] (
  [attemptId] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [_id] CHAR(24) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [createdAt] DATETIME2(3) NULL,
  [updatedAt] DATETIME2(3) NULL,
  [__v] FLOAT(53) NULL,
  [_payload] NVARCHAR(MAX) NOT NULL CHECK (ISJSON([_payload]) = 1),
  [_version] BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT [PK_QuizSubmission] PRIMARY KEY ([_id]),
  CHECK ([_id] IS NULL OR (LEN([_id]) = 24 AND [_id] NOT LIKE '%[^0-9a-f]%'))
);
CREATE UNIQUE NONCLUSTERED INDEX [IX_QuizSubmission_0_8b6dfb] ON [dbo].[QuizSubmission] ([attemptId] ASC);
END;
IF DATABASE_PRINCIPAL_ID(N'miu_runtime_v1') IS NOT NULL
  GRANT SELECT, INSERT, UPDATE ON OBJECT::[dbo].[QuizSubmission] TO [miu_runtime_v1];
COMMIT TRANSACTION;
