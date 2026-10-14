-- University Clubs SQL Server schema v1. Generated from declared schemas.
-- Run only with the migration CLI against an isolated empty target database.
-- This script never creates a database, drops a table, or rewrites source data.
SET XACT_ABORT ON;
IF EXISTS (SELECT 1 FROM sys.tables WHERE is_ms_shipped = 0)
  THROW 51000, 'Refusing schema creation in a non-empty database.', 1;
BEGIN TRANSACTION;
CREATE TABLE [dbo].[PlatformDatabaseState] (
  [id] INT NOT NULL PRIMARY KEY CHECK ([id] = 1),
  [version] INT NOT NULL,
  [validatedAt] DATETIME2(3) NULL,
  [sourceHash] CHAR(64) NULL,
  [validationReportHash] CHAR(64) NULL
);
INSERT INTO [dbo].[PlatformDatabaseState] ([id], [version]) VALUES (1, 1);
CREATE TABLE [dbo].[PlatformMigrationRun] (
  [runId] CHAR(64) NOT NULL PRIMARY KEY,
  [sourceHash] CHAR(64) NOT NULL,
  [status] NVARCHAR(32) NOT NULL,
  [startedAt] DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  [completedAt] DATETIME2(3) NULL
);
CREATE TABLE [dbo].[PlatformMigrationItem] (
  [runId] CHAR(64) NOT NULL REFERENCES [dbo].[PlatformMigrationRun] ([runId]),
  [model] NVARCHAR(64) NOT NULL,
  [documentId] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [sourceHash] CHAR(64) NOT NULL,
  PRIMARY KEY ([runId], [model], [documentId])
);
CREATE TABLE [dbo].[Club] (
  [registrationRevision] FLOAT(53) NULL,
  [id] BIGINT NOT NULL,
  [sortOrder] FLOAT(53) NOT NULL,
  [name] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [committee] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [category] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [tagline] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [image] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [imagePublicId] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [imageFit] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [status] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [applicationCycleStartedAt] DATETIME2(3) NULL,
  [archivedAt] DATETIME2(3) NULL,
  [pinned] BIT NULL,
  [seats] FLOAT(53) NULL,
  [members] FLOAT(53) NULL,
  [applicants] FLOAT(53) NULL,
  [description] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [requirements] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [applicationIntro] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [_id] CHAR(24) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [createdAt] DATETIME2(3) NULL,
  [updatedAt] DATETIME2(3) NULL,
  [__v] FLOAT(53) NULL,
  [_payload] NVARCHAR(MAX) NOT NULL CHECK (ISJSON([_payload]) = 1),
  [_version] BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT [PK_Club] PRIMARY KEY ([_id]),
  CHECK ([imageFit] IS NULL OR [imageFit] IN (N'contain', N'cover')),
  CHECK ([status] IS NULL OR [status] IN (N'open', N'opening-soon', N'full', N'closed')),
  CHECK ([seats] IS NULL OR [seats] >= 0),
  CHECK ([members] IS NULL OR [members] >= 0),
  CHECK ([applicants] IS NULL OR [applicants] >= 0),
  CHECK ([_id] IS NULL OR (LEN([_id]) = 24 AND [_id] NOT LIKE '%[^0-9a-f]%'))
);
CREATE UNIQUE NONCLUSTERED INDEX [IX_Club_0_037c92] ON [dbo].[Club] ([id] ASC);
CREATE NONCLUSTERED INDEX [IX_Club_1_54b8b5] ON [dbo].[Club] ([sortOrder] ASC);
CREATE NONCLUSTERED INDEX [IX_Club_2_137ca0] ON [dbo].[Club] ([archivedAt] ASC);

CREATE TABLE [dbo].[StudentAccount] (
  [email] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [name] NVARCHAR(160) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [universityId] NVARCHAR(40) COLLATE Latin1_General_100_BIN2 NULL,
  [major] NVARCHAR(120) COLLATE Latin1_General_100_BIN2 NULL,
  [phone] NVARCHAR(40) COLLATE Latin1_General_100_BIN2 NULL,
  [age] NVARCHAR(3) COLLATE Latin1_General_100_BIN2 NULL,
  [salt] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [passwordHash] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [googleSub] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NULL,
  [emailNotificationsEnabled] BIT NULL,
  [sessionVersion] FLOAT(53) NULL,
  [lastLoginAt] DATETIME2(3) NULL,
  [_id] CHAR(24) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [createdAt] DATETIME2(3) NULL,
  [updatedAt] DATETIME2(3) NULL,
  [__v] FLOAT(53) NULL,
  [_payload] NVARCHAR(MAX) NOT NULL CHECK (ISJSON([_payload]) = 1),
  [_version] BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT [PK_StudentAccount] PRIMARY KEY ([_id]),
  [_has_googleSub] BIT NOT NULL,
  CHECK ([_id] IS NULL OR (LEN([_id]) = 24 AND [_id] NOT LIKE '%[^0-9a-f]%'))
);
CREATE UNIQUE NONCLUSTERED INDEX [IX_StudentAccount_0_37e5e5] ON [dbo].[StudentAccount] ([email] ASC);
CREATE UNIQUE NONCLUSTERED INDEX [IX_StudentAccount_1_b9890c] ON [dbo].[StudentAccount] ([googleSub] ASC) WHERE ([_has_googleSub] = 1);

CREATE TABLE [dbo].[ClubAccount] (
  [googleSub] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NULL,
  [clubId] BIGINT NOT NULL,
  [email] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [salt] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [passwordHash] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [sessionVersion] FLOAT(53) NULL,
  [passwordChangedAt] DATETIME2(3) NULL,
  [lastLoginAt] DATETIME2(3) NULL,
  [role] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [committee] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [_id] CHAR(24) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [createdAt] DATETIME2(3) NULL,
  [updatedAt] DATETIME2(3) NULL,
  [__v] FLOAT(53) NULL,
  [_payload] NVARCHAR(MAX) NOT NULL CHECK (ISJSON([_payload]) = 1),
  [_version] BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT [PK_ClubAccount] PRIMARY KEY ([_id]),
  [_has_googleSub] BIT NOT NULL,
  CHECK ([role] IS NULL OR [role] IN (N'president', N'head', N'pr', N'english', N'security', N'sso', N'dean', N'supervisor', N'miu_events', N'software_development')),
  CHECK ([_id] IS NULL OR (LEN([_id]) = 24 AND [_id] NOT LIKE '%[^0-9a-f]%'))
);
CREATE UNIQUE NONCLUSTERED INDEX [IX_ClubAccount_0_b9890c] ON [dbo].[ClubAccount] ([googleSub] ASC) WHERE ([_has_googleSub] = 1);
CREATE NONCLUSTERED INDEX [IX_ClubAccount_1_8ee33f] ON [dbo].[ClubAccount] ([clubId] ASC);
CREATE UNIQUE NONCLUSTERED INDEX [IX_ClubAccount_2_37e5e5] ON [dbo].[ClubAccount] ([email] ASC);

CREATE TABLE [dbo].[SpeakerInvite] (
  [clubId] BIGINT NOT NULL,
  [clubName] NVARCHAR(120) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [createdByEmail] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [createdByName] NVARCHAR(160) COLLATE Latin1_General_100_BIN2 NULL,
  [createdByRole] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [tokenHash] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [stableToken] BIT NULL,
  [expiresAt] DATETIME2(3) NULL,
  [revokedAt] DATETIME2(3) NULL,
  [_id] CHAR(24) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [createdAt] DATETIME2(3) NULL,
  [updatedAt] DATETIME2(3) NULL,
  [__v] FLOAT(53) NULL,
  [_payload] NVARCHAR(MAX) NOT NULL CHECK (ISJSON([_payload]) = 1),
  [_version] BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT [PK_SpeakerInvite] PRIMARY KEY ([_id]),
  CHECK ([createdByRole] IS NULL OR [createdByRole] IN (N'president', N'head', N'dean')),
  CHECK ([_id] IS NULL OR (LEN([_id]) = 24 AND [_id] NOT LIKE '%[^0-9a-f]%'))
);
CREATE NONCLUSTERED INDEX [IX_SpeakerInvite_0_8ee33f] ON [dbo].[SpeakerInvite] ([clubId] ASC);
CREATE UNIQUE NONCLUSTERED INDEX [IX_SpeakerInvite_1_78c8ef] ON [dbo].[SpeakerInvite] ([tokenHash] ASC);
CREATE NONCLUSTERED INDEX [IX_SpeakerInvite_2_fcb1f5] ON [dbo].[SpeakerInvite] ([clubId] ASC, [createdByEmail] ASC, [revokedAt] ASC);
CREATE UNIQUE NONCLUSTERED INDEX [IX_SpeakerInvite_3_05f9d3] ON [dbo].[SpeakerInvite] ([clubId] ASC, [createdByEmail] ASC) WHERE [stableToken] = 1 AND [revokedAt] IS NULL;

CREATE TABLE [dbo].[AttendanceSession] (
  [clubId] BIGINT NOT NULL,
  [sourceType] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NULL,
  [attendanceAudience] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NULL,
  [assignedSupervisorEmail] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [itemType] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NULL,
  [eventRequestId] BIGINT NOT NULL,
  [eventTitle] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [eventDate] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [eventTime] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [tokenHash] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [active] BIT NULL,
  [createdBy] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [assignedMemberEmail] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NULL,
  [assignedDeviceHash] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [assignedMemberAccepted] BIT NULL,
  [assignedAcceptedAt] DATETIME2(3) NULL,
  [_id] CHAR(24) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [createdAt] DATETIME2(3) NULL,
  [updatedAt] DATETIME2(3) NULL,
  [__v] FLOAT(53) NULL,
  [_payload] NVARCHAR(MAX) NOT NULL CHECK (ISJSON([_payload]) = 1),
  [_version] BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT [PK_AttendanceSession] PRIMARY KEY ([_id]),
  CHECK ([sourceType] IS NULL OR [sourceType] IN (N'club', N'miu')),
  CHECK ([attendanceAudience] IS NULL OR [attendanceAudience] IN (N'members', N'all_students')),
  CHECK ([itemType] IS NULL OR [itemType] IN (N'event', N'booth')),
  CHECK ([_id] IS NULL OR (LEN([_id]) = 24 AND [_id] NOT LIKE '%[^0-9a-f]%'))
);
CREATE NONCLUSTERED INDEX [IX_AttendanceSession_0_8ee33f] ON [dbo].[AttendanceSession] ([clubId] ASC);
CREATE NONCLUSTERED INDEX [IX_AttendanceSession_1_a57565] ON [dbo].[AttendanceSession] ([sourceType] ASC);
CREATE NONCLUSTERED INDEX [IX_AttendanceSession_2_196406] ON [dbo].[AttendanceSession] ([attendanceAudience] ASC);
CREATE NONCLUSTERED INDEX [IX_AttendanceSession_3_f2ba58] ON [dbo].[AttendanceSession] ([itemType] ASC);
CREATE UNIQUE NONCLUSTERED INDEX [IX_AttendanceSession_4_78c8ef] ON [dbo].[AttendanceSession] ([tokenHash] ASC);
CREATE NONCLUSTERED INDEX [IX_AttendanceSession_5_df43ba] ON [dbo].[AttendanceSession] ([active] ASC);
CREATE NONCLUSTERED INDEX [IX_AttendanceSession_6_5e8b3c] ON [dbo].[AttendanceSession] ([assignedMemberEmail] ASC);
CREATE NONCLUSTERED INDEX [IX_AttendanceSession_7_202d6a] ON [dbo].[AttendanceSession] ([clubId] ASC, [itemType] ASC, [eventRequestId] ASC, [active] ASC);
CREATE NONCLUSTERED INDEX [IX_AttendanceSession_legacy_0_724a73] ON [dbo].[AttendanceSession] ([clubId] ASC, [eventRequestId] ASC, [active] ASC);

CREATE TABLE [dbo].[AccountPhoto] (
  [email] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [url] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [publicId] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [promptDismissed] BIT NULL,
  [_id] CHAR(24) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [createdAt] DATETIME2(3) NULL,
  [updatedAt] DATETIME2(3) NULL,
  [__v] FLOAT(53) NULL,
  [_payload] NVARCHAR(MAX) NOT NULL CHECK (ISJSON([_payload]) = 1),
  [_version] BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT [PK_AccountPhoto] PRIMARY KEY ([_id]),
  CHECK ([_id] IS NULL OR (LEN([_id]) = 24 AND [_id] NOT LIKE '%[^0-9a-f]%'))
);
CREATE UNIQUE NONCLUSTERED INDEX [IX_AccountPhoto_0_37e5e5] ON [dbo].[AccountPhoto] ([email] ASC);

CREATE TABLE [dbo].[AdminAuthState] (
  [googleSub] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NULL,
  [email] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [salt] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [passwordHash] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [sessionVersion] FLOAT(53) NULL,
  [passwordChangedAt] DATETIME2(3) NULL,
  [lastLoginAt] DATETIME2(3) NULL,
  [_id] CHAR(24) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [createdAt] DATETIME2(3) NULL,
  [updatedAt] DATETIME2(3) NULL,
  [__v] FLOAT(53) NULL,
  [_payload] NVARCHAR(MAX) NOT NULL CHECK (ISJSON([_payload]) = 1),
  [_version] BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT [PK_AdminAuthState] PRIMARY KEY ([_id]),
  [_has_googleSub] BIT NOT NULL,
  CHECK ([_id] IS NULL OR (LEN([_id]) = 24 AND [_id] NOT LIKE '%[^0-9a-f]%'))
);
CREATE UNIQUE NONCLUSTERED INDEX [IX_AdminAuthState_0_b9890c] ON [dbo].[AdminAuthState] ([googleSub] ASC) WHERE ([_has_googleSub] = 1);
CREATE UNIQUE NONCLUSTERED INDEX [IX_AdminAuthState_1_37e5e5] ON [dbo].[AdminAuthState] ([email] ASC);

CREATE TABLE [dbo].[Application] (
  [id] BIGINT NOT NULL,
  [studentName] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [email] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [studentAccountId] CHAR(24) COLLATE Latin1_General_100_BIN2 NULL,
  [studentClubKey] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NULL,
  [universityId] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [major] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [phone] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [slot] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [clubId] BIGINT NOT NULL,
  [committee] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [memberPosition] NVARCHAR(100) COLLATE Latin1_General_100_BIN2 NULL,
  [memberType] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [age] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [motivation] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [notes] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [rating] FLOAT(53) NULL,
  [interviewed] BIT NULL,
  [status] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NULL,
  [photo] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [photoPublicId] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [managementTokenHash] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [_id] CHAR(24) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [createdAt] DATETIME2(3) NULL,
  [updatedAt] DATETIME2(3) NULL,
  [__v] FLOAT(53) NULL,
  [_payload] NVARCHAR(MAX) NOT NULL CHECK (ISJSON([_payload]) = 1),
  [_version] BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT [PK_Application] PRIMARY KEY ([_id]),
  [_has_studentClubKey] BIT NOT NULL,
  CHECK ([studentAccountId] IS NULL OR (LEN([studentAccountId]) = 24 AND [studentAccountId] NOT LIKE '%[^0-9a-f]%')),
  CHECK ([memberType] IS NULL OR [memberType] IN (N'new', N'senior')),
  CHECK ([rating] IS NULL OR [rating] >= 0),
  CHECK ([rating] IS NULL OR [rating] <= 5),
  CHECK ([status] IS NULL OR [status] IN (N'pending', N'accepted', N'rejected')),
  CHECK ([_id] IS NULL OR (LEN([_id]) = 24 AND [_id] NOT LIKE '%[^0-9a-f]%'))
);
CREATE UNIQUE NONCLUSTERED INDEX [IX_Application_0_037c92] ON [dbo].[Application] ([id] ASC);
CREATE NONCLUSTERED INDEX [IX_Application_1_6984f0] ON [dbo].[Application] ([studentAccountId] ASC);
CREATE NONCLUSTERED INDEX [IX_Application_2_8ee33f] ON [dbo].[Application] ([clubId] ASC);
CREATE UNIQUE NONCLUSTERED INDEX [IX_Application_3_ca4d09] ON [dbo].[Application] ([studentClubKey] ASC) WHERE ([_has_studentClubKey] = 1);
CREATE NONCLUSTERED INDEX [IX_Application_4_bd06f7] ON [dbo].[Application] ([status] ASC, [clubId] ASC, [email] ASC);
CREATE NONCLUSTERED INDEX [IX_Application_5_c58fc0] ON [dbo].[Application] ([clubId] ASC, [createdAt] ASC);

CREATE TABLE [dbo].[AttendanceActivityClosure] (
  [clubId] BIGINT NOT NULL,
  [itemType] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [eventRequestId] BIGINT NOT NULL,
  [eventTitle] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [eventDate] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [endedByEmail] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [endedByRole] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [endedAt] DATETIME2(3) NULL,
  [_id] CHAR(24) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [createdAt] DATETIME2(3) NULL,
  [updatedAt] DATETIME2(3) NULL,
  [__v] FLOAT(53) NULL,
  [_payload] NVARCHAR(MAX) NOT NULL CHECK (ISJSON([_payload]) = 1),
  [_version] BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT [PK_AttendanceActivityClosure] PRIMARY KEY ([_id]),
  CHECK ([itemType] IS NULL OR [itemType] IN (N'event', N'booth')),
  CHECK ([endedByRole] IS NULL OR [endedByRole] IN (N'president', N'head', N'pr', N'sso', N'dean', N'admin', N'software_development')),
  CHECK ([_id] IS NULL OR (LEN([_id]) = 24 AND [_id] NOT LIKE '%[^0-9a-f]%'))
);
CREATE NONCLUSTERED INDEX [IX_AttendanceActivityClosure_0_8ee33f] ON [dbo].[AttendanceActivityClosure] ([clubId] ASC);
CREATE UNIQUE NONCLUSTERED INDEX [IX_AttendanceActivityClosure_1_91565c] ON [dbo].[AttendanceActivityClosure] ([clubId] ASC, [itemType] ASC, [eventRequestId] ASC);

CREATE TABLE [dbo].[AttendanceAssignment] (
  [clubId] BIGINT NOT NULL,
  [clubName] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [itemType] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [eventRequestId] BIGINT NOT NULL,
  [eventTitle] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [eventDate] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NULL,
  [eventTime] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [memberEmail] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [checkInDeviceHash] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [activeMemberDayKey] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NULL,
  [memberName] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [committee] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [assignedBy] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [status] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NULL,
  [acceptedAt] DATETIME2(3) NULL,
  [_id] CHAR(24) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [createdAt] DATETIME2(3) NULL,
  [updatedAt] DATETIME2(3) NULL,
  [__v] FLOAT(53) NULL,
  [_payload] NVARCHAR(MAX) NOT NULL CHECK (ISJSON([_payload]) = 1),
  [_version] BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT [PK_AttendanceAssignment] PRIMARY KEY ([_id]),
  CHECK ([itemType] IS NULL OR [itemType] IN (N'event', N'booth')),
  CHECK ([status] IS NULL OR [status] IN (N'assigned', N'accepted')),
  CHECK ([_id] IS NULL OR (LEN([_id]) = 24 AND [_id] NOT LIKE '%[^0-9a-f]%'))
);
CREATE NONCLUSTERED INDEX [IX_AttendanceAssignment_0_8ee33f] ON [dbo].[AttendanceAssignment] ([clubId] ASC);
CREATE NONCLUSTERED INDEX [IX_AttendanceAssignment_1_6a3dad] ON [dbo].[AttendanceAssignment] ([memberEmail] ASC);
CREATE NONCLUSTERED INDEX [IX_AttendanceAssignment_2_587fa9] ON [dbo].[AttendanceAssignment] ([status] ASC);
CREATE UNIQUE NONCLUSTERED INDEX [IX_AttendanceAssignment_3_91565c] ON [dbo].[AttendanceAssignment] ([clubId] ASC, [itemType] ASC, [eventRequestId] ASC);
CREATE NONCLUSTERED INDEX [IX_AttendanceAssignment_4_ca04b2] ON [dbo].[AttendanceAssignment] ([memberEmail] ASC, [eventDate] ASC);
CREATE UNIQUE NONCLUSTERED INDEX [IX_AttendanceAssignment_5_34fb9f] ON [dbo].[AttendanceAssignment] ([activeMemberDayKey] ASC) WHERE [activeMemberDayKey] IS NOT NULL;

CREATE TABLE [dbo].[AttendanceRecord] (
  [universityId] NVARCHAR(40) COLLATE Latin1_General_100_BIN2 NULL,
  [major] NVARCHAR(120) COLLATE Latin1_General_100_BIN2 NULL,
  [attendanceAudience] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NULL,
  [membershipStatus] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NULL,
  [supervisorEmail] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [sessionId] CHAR(24) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [clubId] BIGINT NOT NULL,
  [itemType] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NULL,
  [eventRequestId] BIGINT NOT NULL,
  [eventTitle] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [eventDate] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [eventTime] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [name] NVARCHAR(160) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [email] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [deviceHash] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NULL,
  [note] NVARCHAR(500) COLLATE Latin1_General_100_BIN2 NULL,
  [approvalStatus] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NULL,
  [attendedAt] DATETIME2(3) NOT NULL,
  [_id] CHAR(24) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [createdAt] DATETIME2(3) NULL,
  [updatedAt] DATETIME2(3) NULL,
  [__v] FLOAT(53) NULL,
  [_payload] NVARCHAR(MAX) NOT NULL CHECK (ISJSON([_payload]) = 1),
  [_version] BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT [PK_AttendanceRecord] PRIMARY KEY ([_id]),
  CHECK ([attendanceAudience] IS NULL OR [attendanceAudience] IN (N'members', N'all_students')),
  CHECK ([membershipStatus] IS NULL OR [membershipStatus] IN (N'member', N'non_member', N'unknown')),
  CHECK ([sessionId] IS NULL OR (LEN([sessionId]) = 24 AND [sessionId] NOT LIKE '%[^0-9a-f]%')),
  CHECK ([itemType] IS NULL OR [itemType] IN (N'event', N'booth')),
  CHECK ([approvalStatus] IS NULL OR [approvalStatus] IN (N'pending_supervisor', N'pending_pr', N'pending_sso', N'pending_dean', N'approved', N'rejected')),
  CHECK ([_id] IS NULL OR (LEN([_id]) = 24 AND [_id] NOT LIKE '%[^0-9a-f]%'))
);
CREATE NONCLUSTERED INDEX [IX_AttendanceRecord_0_196406] ON [dbo].[AttendanceRecord] ([attendanceAudience] ASC);
CREATE NONCLUSTERED INDEX [IX_AttendanceRecord_1_1bc295] ON [dbo].[AttendanceRecord] ([membershipStatus] ASC);
CREATE NONCLUSTERED INDEX [IX_AttendanceRecord_2_0b9bac] ON [dbo].[AttendanceRecord] ([sessionId] ASC);
CREATE NONCLUSTERED INDEX [IX_AttendanceRecord_3_8ee33f] ON [dbo].[AttendanceRecord] ([clubId] ASC);
CREATE NONCLUSTERED INDEX [IX_AttendanceRecord_4_f2ba58] ON [dbo].[AttendanceRecord] ([itemType] ASC);
CREATE NONCLUSTERED INDEX [IX_AttendanceRecord_5_7e8004] ON [dbo].[AttendanceRecord] ([approvalStatus] ASC);
CREATE UNIQUE NONCLUSTERED INDEX [IX_AttendanceRecord_6_f32fa6] ON [dbo].[AttendanceRecord] ([clubId] ASC, [itemType] ASC, [eventRequestId] ASC, [email] ASC);
CREATE UNIQUE NONCLUSTERED INDEX [IX_AttendanceRecord_7_db3a8e] ON [dbo].[AttendanceRecord] ([clubId] ASC, [itemType] ASC, [eventRequestId] ASC, [deviceHash] ASC) WHERE [deviceHash] IS NOT NULL;
CREATE UNIQUE NONCLUSTERED INDEX [IX_AttendanceRecord_legacy_0_3927ab] ON [dbo].[AttendanceRecord] ([sessionId] ASC, [email] ASC);
CREATE UNIQUE NONCLUSTERED INDEX [IX_AttendanceRecord_legacy_1_04b557] ON [dbo].[AttendanceRecord] ([clubId] ASC, [eventRequestId] ASC, [email] ASC);

CREATE TABLE [dbo].[AuditLog] (
  [id] BIGINT NOT NULL,
  [actorEmail] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [actorRole] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [action] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [targetType] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [targetId] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [targetName] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [details] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [ip] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [timestamp] DATETIME2(3) NULL,
  [_id] CHAR(24) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [createdAt] DATETIME2(3) NULL,
  [updatedAt] DATETIME2(3) NULL,
  [__v] FLOAT(53) NULL,
  [_payload] NVARCHAR(MAX) NOT NULL CHECK (ISJSON([_payload]) = 1),
  [_version] BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT [PK_AuditLog] PRIMARY KEY ([_id]),
  CHECK ([_id] IS NULL OR (LEN([_id]) = 24 AND [_id] NOT LIKE '%[^0-9a-f]%'))
);
CREATE UNIQUE NONCLUSTERED INDEX [IX_AuditLog_0_037c92] ON [dbo].[AuditLog] ([id] ASC);
CREATE NONCLUSTERED INDEX [IX_AuditLog_1_574b95] ON [dbo].[AuditLog] ([actorEmail] ASC);
CREATE NONCLUSTERED INDEX [IX_AuditLog_2_1b0586] ON [dbo].[AuditLog] ([timestamp] ASC);

CREATE TABLE [dbo].[ContentRequest] (
  [id] BIGINT NOT NULL,
  [clubId] BIGINT NOT NULL,
  [clubName] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [assignedHeadEmail] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [type] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [title] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [description] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [date] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [time] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [registrationEnabled] BIT NULL,
  [attendanceEnabled] BIT NULL,
  [attendanceAudience] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NULL,
  [location] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [budget] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [image] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [sponsorName] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [sponsorCompany] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [sponsorContact] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [sponsorEmail] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [sponsorPhone] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [sponsorType] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [sponsorAmount] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [sponsorBenefits] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [sponsorDescription] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [sponsorLogo] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [sponsorAttachment] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [sponsorNotes] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [boothName] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [boothPurpose] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [boothDescription] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [boothLocation] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [boothSize] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [boothEquipment] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [boothSetupDate] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [boothOpenDate] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [boothCloseDate] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [boothContact] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [boothNotes] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [status] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NULL,
  [resubmitTo] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [editRequestedBy] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [supervisorNextStage] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [supervisorReviewerEmail] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [supervisorReviewedAt] DATETIME2(3) NULL,
  [skipEnglishOnNextPrApproval] BIT NULL,
  [clubNotice] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [submittedAt] DATETIME2(3) NULL,
  [publishedAt] DATETIME2(3) NULL,
  [deletedAt] DATETIME2(3) NULL,
  [_id] CHAR(24) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [createdAt] DATETIME2(3) NULL,
  [updatedAt] DATETIME2(3) NULL,
  [__v] FLOAT(53) NULL,
  [_payload] NVARCHAR(MAX) NOT NULL CHECK (ISJSON([_payload]) = 1),
  [_version] BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT [PK_ContentRequest] PRIMARY KEY ([_id]),
  CHECK ([type] IS NULL OR [type] IN (N'event', N'feed', N'sponsor', N'booth', N'entry_permit')),
  CHECK ([attendanceAudience] IS NULL OR [attendanceAudience] IN (N'members', N'all_students')),
  CHECK ([status] IS NULL OR [status] IN (N'draft', N'pending_supervisor', N'pending_pr', N'pending_english', N'pending_security', N'pending_dean', N'changes_requested', N'rejected', N'published', N'approved', N'deleted')),
  CHECK ([resubmitTo] IS NULL OR [resubmitTo] IN (N'pending_supervisor', N'pending_pr', N'pending_english', N'pending_security')),
  CHECK ([editRequestedBy] IS NULL OR [editRequestedBy] IN (N'', N'supervisor', N'pr', N'english', N'security')),
  CHECK ([supervisorNextStage] IS NULL OR [supervisorNextStage] IN (N'pending_pr', N'pending_english', N'pending_security', N'pending_dean')),
  CHECK ([_id] IS NULL OR (LEN([_id]) = 24 AND [_id] NOT LIKE '%[^0-9a-f]%'))
);
CREATE UNIQUE NONCLUSTERED INDEX [IX_ContentRequest_0_037c92] ON [dbo].[ContentRequest] ([id] ASC);
CREATE NONCLUSTERED INDEX [IX_ContentRequest_1_8ee33f] ON [dbo].[ContentRequest] ([clubId] ASC);
CREATE NONCLUSTERED INDEX [IX_ContentRequest_2_196406] ON [dbo].[ContentRequest] ([attendanceAudience] ASC);
CREATE NONCLUSTERED INDEX [IX_ContentRequest_3_587fa9] ON [dbo].[ContentRequest] ([status] ASC);

CREATE TABLE [dbo].[EventRegistration] (
  [studentAccountId] CHAR(24) COLLATE Latin1_General_100_BIN2 NULL,
  [eventRequestId] BIGINT NULL,
  [registrationKey] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NULL,
  [id] BIGINT NOT NULL,
  [clubId] BIGINT NOT NULL,
  [eventIndex] BIGINT NOT NULL,
  [eventTitle] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [name] NVARCHAR(160) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [email] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [_id] CHAR(24) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [createdAt] DATETIME2(3) NULL,
  [updatedAt] DATETIME2(3) NULL,
  [__v] FLOAT(53) NULL,
  [_payload] NVARCHAR(MAX) NOT NULL CHECK (ISJSON([_payload]) = 1),
  [_version] BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT [PK_EventRegistration] PRIMARY KEY ([_id]),
  [_has_registrationKey] BIT NOT NULL,
  CHECK ([studentAccountId] IS NULL OR (LEN([studentAccountId]) = 24 AND [studentAccountId] NOT LIKE '%[^0-9a-f]%')),
  CHECK ([_id] IS NULL OR (LEN([_id]) = 24 AND [_id] NOT LIKE '%[^0-9a-f]%'))
);
CREATE UNIQUE NONCLUSTERED INDEX [IX_EventRegistration_0_037c92] ON [dbo].[EventRegistration] ([id] ASC);
CREATE NONCLUSTERED INDEX [IX_EventRegistration_1_8ee33f] ON [dbo].[EventRegistration] ([clubId] ASC);
CREATE UNIQUE NONCLUSTERED INDEX [IX_EventRegistration_2_539f72] ON [dbo].[EventRegistration] ([clubId] ASC, [eventIndex] ASC, [email] ASC);
CREATE UNIQUE NONCLUSTERED INDEX [IX_EventRegistration_3_0e6e72] ON [dbo].[EventRegistration] ([registrationKey] ASC) WHERE ([_has_registrationKey] = 1);

CREATE TABLE [dbo].[EventReport] (
  [clubId] BIGINT NOT NULL,
  [eventKey] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [summary] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [objectives] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [activities] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [outcomes] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [lessonsLearned] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [status] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [revision] FLOAT(53) NOT NULL,
  [submittedAt] DATETIME2(3) NULL,
  [updatedBy] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [_id] CHAR(24) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [createdAt] DATETIME2(3) NULL,
  [updatedAt] DATETIME2(3) NULL,
  [__v] FLOAT(53) NULL,
  [_payload] NVARCHAR(MAX) NOT NULL CHECK (ISJSON([_payload]) = 1),
  [_version] BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT [PK_EventReport] PRIMARY KEY ([_id]),
  CHECK ([status] IS NULL OR [status] IN (N'draft', N'submitted', N'changes_requested', N'reviewed')),
  CHECK ([_id] IS NULL OR (LEN([_id]) = 24 AND [_id] NOT LIKE '%[^0-9a-f]%'))
);
CREATE UNIQUE NONCLUSTERED INDEX [IX_EventReport_0_048d74] ON [dbo].[EventReport] ([clubId] ASC, [eventKey] ASC);

CREATE TABLE [dbo].[LoginAttempt] (
  [sourceHash] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [windowStart] DATETIME2(3) NOT NULL,
  [failures] FLOAT(53) NOT NULL,
  [lockedUntil] DATETIME2(3) NULL,
  [expiresAt] DATETIME2(3) NOT NULL,
  [_id] CHAR(24) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [createdAt] DATETIME2(3) NULL,
  [updatedAt] DATETIME2(3) NULL,
  [__v] FLOAT(53) NULL,
  [_payload] NVARCHAR(MAX) NOT NULL CHECK (ISJSON([_payload]) = 1),
  [_version] BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT [PK_LoginAttempt] PRIMARY KEY ([_id]),
  CHECK ([_id] IS NULL OR (LEN([_id]) = 24 AND [_id] NOT LIKE '%[^0-9a-f]%'))
);
CREATE UNIQUE NONCLUSTERED INDEX [IX_LoginAttempt_0_d52a82] ON [dbo].[LoginAttempt] ([sourceHash] ASC);
CREATE NONCLUSTERED INDEX [IX_LoginAttempt_1_cd5875] ON [dbo].[LoginAttempt] ([expiresAt] ASC);

CREATE TABLE [dbo].[NotificationDispatch] (
  [eventKey] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [status] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [providerMessageId] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [errorCode] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [attemptedAt] DATETIME2(3) NULL,
  [_id] CHAR(24) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [createdAt] DATETIME2(3) NULL,
  [updatedAt] DATETIME2(3) NULL,
  [__v] FLOAT(53) NULL,
  [_payload] NVARCHAR(MAX) NOT NULL CHECK (ISJSON([_payload]) = 1),
  [_version] BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT [PK_NotificationDispatch] PRIMARY KEY ([_id]),
  CHECK ([status] IS NULL OR [status] IN (N'sending', N'sent', N'no_recipient', N'failed')),
  CHECK ([_id] IS NULL OR (LEN([_id]) = 24 AND [_id] NOT LIKE '%[^0-9a-f]%'))
);
CREATE UNIQUE NONCLUSTERED INDEX [IX_NotificationDispatch_0_701d7a] ON [dbo].[NotificationDispatch] ([eventKey] ASC);

CREATE TABLE [dbo].[PasswordRecoveryRateLimit] (
  [sourceHash] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [windowStart] DATETIME2(3) NOT NULL,
  [count] FLOAT(53) NOT NULL,
  [expiresAt] DATETIME2(3) NOT NULL,
  [_id] CHAR(24) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [createdAt] DATETIME2(3) NULL,
  [updatedAt] DATETIME2(3) NULL,
  [__v] FLOAT(53) NULL,
  [_payload] NVARCHAR(MAX) NOT NULL CHECK (ISJSON([_payload]) = 1),
  [_version] BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT [PK_PasswordRecoveryRateLimit] PRIMARY KEY ([_id]),
  CHECK ([_id] IS NULL OR (LEN([_id]) = 24 AND [_id] NOT LIKE '%[^0-9a-f]%'))
);
CREATE UNIQUE NONCLUSTERED INDEX [IX_PasswordRecoveryRateLimit_0_d52a82] ON [dbo].[PasswordRecoveryRateLimit] ([sourceHash] ASC);
CREATE NONCLUSTERED INDEX [IX_PasswordRecoveryRateLimit_1_cd5875] ON [dbo].[PasswordRecoveryRateLimit] ([expiresAt] ASC);

CREATE TABLE [dbo].[PasswordResetToken] (
  [accountType] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [email] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [tokenHash] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [expiresAt] DATETIME2(3) NOT NULL,
  [_id] CHAR(24) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [createdAt] DATETIME2(3) NULL,
  [updatedAt] DATETIME2(3) NULL,
  [__v] FLOAT(53) NULL,
  [_payload] NVARCHAR(MAX) NOT NULL CHECK (ISJSON([_payload]) = 1),
  [_version] BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT [PK_PasswordResetToken] PRIMARY KEY ([_id]),
  CHECK ([accountType] IS NULL OR [accountType] IN (N'admin', N'club', N'student')),
  CHECK ([_id] IS NULL OR (LEN([_id]) = 24 AND [_id] NOT LIKE '%[^0-9a-f]%'))
);
CREATE UNIQUE NONCLUSTERED INDEX [IX_PasswordResetToken_0_78c8ef] ON [dbo].[PasswordResetToken] ([tokenHash] ASC);
CREATE UNIQUE NONCLUSTERED INDEX [IX_PasswordResetToken_1_915415] ON [dbo].[PasswordResetToken] ([accountType] ASC, [email] ASC);
CREATE NONCLUSTERED INDEX [IX_PasswordResetToken_2_cd5875] ON [dbo].[PasswordResetToken] ([expiresAt] ASC);

CREATE TABLE [dbo].[SiteNetwork] (
  [ipHash] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [firstSeenAt] DATETIME2(3) NOT NULL,
  [lastSeenAt] DATETIME2(3) NOT NULL,
  [_id] CHAR(24) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [_payload] NVARCHAR(MAX) NOT NULL CHECK (ISJSON([_payload]) = 1),
  [_version] BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT [PK_SiteNetwork] PRIMARY KEY ([_id]),
  CHECK ([_id] IS NULL OR (LEN([_id]) = 24 AND [_id] NOT LIKE '%[^0-9a-f]%'))
);
CREATE UNIQUE NONCLUSTERED INDEX [IX_SiteNetwork_0_a43395] ON [dbo].[SiteNetwork] ([ipHash] ASC);

CREATE TABLE [dbo].[SiteSetting] (
  [key] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [title] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [subtitle] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [_id] CHAR(24) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [createdAt] DATETIME2(3) NULL,
  [updatedAt] DATETIME2(3) NULL,
  [__v] FLOAT(53) NULL,
  [_payload] NVARCHAR(MAX) NOT NULL CHECK (ISJSON([_payload]) = 1),
  [_version] BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT [PK_SiteSetting] PRIMARY KEY ([_id]),
  CHECK ([_id] IS NULL OR (LEN([_id]) = 24 AND [_id] NOT LIKE '%[^0-9a-f]%'))
);
CREATE UNIQUE NONCLUSTERED INDEX [IX_SiteSetting_0_b781d5] ON [dbo].[SiteSetting] ([key] ASC);

CREATE TABLE [dbo].[SiteVisitor] (
  [visitorId] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [deviceType] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NULL,
  [deviceName] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [browserName] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [accountType] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NULL,
  [accountEmail] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NULL,
  [accountName] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [accountLabel] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [firstSeenAt] DATETIME2(3) NOT NULL,
  [lastSeenAt] DATETIME2(3) NOT NULL,
  [_id] CHAR(24) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [_payload] NVARCHAR(MAX) NOT NULL CHECK (ISJSON([_payload]) = 1),
  [_version] BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT [PK_SiteVisitor] PRIMARY KEY ([_id]),
  CHECK ([deviceType] IS NULL OR [deviceType] IN (N'mobile', N'tablet', N'desktop', N'unknown')),
  CHECK ([accountType] IS NULL OR [accountType] IN (N'guest', N'admin', N'club', N'student')),
  CHECK ([_id] IS NULL OR (LEN([_id]) = 24 AND [_id] NOT LIKE '%[^0-9a-f]%'))
);
CREATE UNIQUE NONCLUSTERED INDEX [IX_SiteVisitor_0_274719] ON [dbo].[SiteVisitor] ([visitorId] ASC);
CREATE NONCLUSTERED INDEX [IX_SiteVisitor_1_a561dc] ON [dbo].[SiteVisitor] ([deviceType] ASC);
CREATE NONCLUSTERED INDEX [IX_SiteVisitor_2_8818e6] ON [dbo].[SiteVisitor] ([accountType] ASC);
CREATE NONCLUSTERED INDEX [IX_SiteVisitor_3_ab3192] ON [dbo].[SiteVisitor] ([accountEmail] ASC);
CREATE NONCLUSTERED INDEX [IX_SiteVisitor_4_61cdee] ON [dbo].[SiteVisitor] ([lastSeenAt] ASC);

CREATE TABLE [dbo].[SiteVisitorPresence] (
  [visitorId] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [ipAddress] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [expiresAt] DATETIME2(3) NOT NULL,
  [_id] CHAR(24) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [_payload] NVARCHAR(MAX) NOT NULL CHECK (ISJSON([_payload]) = 1),
  [_version] BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT [PK_SiteVisitorPresence] PRIMARY KEY ([_id]),
  CHECK ([_id] IS NULL OR (LEN([_id]) = 24 AND [_id] NOT LIKE '%[^0-9a-f]%'))
);
CREATE UNIQUE NONCLUSTERED INDEX [IX_SiteVisitorPresence_0_274719] ON [dbo].[SiteVisitorPresence] ([visitorId] ASC);
CREATE NONCLUSTERED INDEX [IX_SiteVisitorPresence_1_cd5875] ON [dbo].[SiteVisitorPresence] ([expiresAt] ASC);

CREATE TABLE [dbo].[SpeakerCvUpload] (
  [_id] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [publicId] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [requesterKey] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [expiresAt] DATETIME2(3) NOT NULL,
  [consumedAt] DATETIME2(3) NULL,
  [createdAt] DATETIME2(3) NULL,
  [updatedAt] DATETIME2(3) NULL,
  [__v] FLOAT(53) NULL,
  [_payload] NVARCHAR(MAX) NOT NULL CHECK (ISJSON([_payload]) = 1),
  [_version] BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT [PK_SpeakerCvUpload] PRIMARY KEY ([_id])
);
CREATE UNIQUE NONCLUSTERED INDEX [IX_SpeakerCvUpload_0_17bc7a] ON [dbo].[SpeakerCvUpload] ([publicId] ASC);
CREATE NONCLUSTERED INDEX [IX_SpeakerCvUpload_1_a61e05] ON [dbo].[SpeakerCvUpload] ([requesterKey] ASC);
CREATE NONCLUSTERED INDEX [IX_SpeakerCvUpload_2_cd5875] ON [dbo].[SpeakerCvUpload] ([expiresAt] ASC);

CREATE TABLE [dbo].[SpeakerRequest] (
  [clubId] BIGINT NOT NULL,
  [clubName] NVARCHAR(120) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [hostingType] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NULL,
  [requesterType] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [requesterId] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [requesterEmail] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [requesterName] NVARCHAR(160) COLLATE Latin1_General_100_BIN2 NULL,
  [requesterRole] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [inviteId] CHAR(24) COLLATE Latin1_General_100_BIN2 NULL,
  [assignedHeadEmail] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NULL,
  [speakerEmail] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NULL,
  [speakerName] NVARCHAR(160) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [jobTitleCompany] NVARCHAR(300) COLLATE Latin1_General_100_BIN2 NULL,
  [linkedinProfile] NVARCHAR(500) COLLATE Latin1_General_100_BIN2 NULL,
  [speakerSelectionReason] NVARCHAR(2000) COLLATE Latin1_General_100_BIN2 NULL,
  [expectedStudentBenefit] NVARCHAR(2000) COLLATE Latin1_General_100_BIN2 NULL,
  [shortBio] NVARCHAR(2000) COLLATE Latin1_General_100_BIN2 NULL,
  [sessionFormat] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [availability] NVARCHAR(500) COLLATE Latin1_General_100_BIN2 NULL,
  [specialRequirements] NVARCHAR(1500) COLLATE Latin1_General_100_BIN2 NULL,
  [professionalDetails] NVARCHAR(2000) COLLATE Latin1_General_100_BIN2 NULL,
  [contactDetails] NVARCHAR(500) COLLATE Latin1_General_100_BIN2 NULL,
  [proposedTopic] NVARCHAR(300) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [eventPurpose] NVARCHAR(2000) COLLATE Latin1_General_100_BIN2 NULL,
  [proposedDate] DATETIME2(3) NULL,
  [cvPublicId] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [cvFormat] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [cvName] NVARCHAR(180) COLLATE Latin1_General_100_BIN2 NULL,
  [status] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NULL,
  [activeRequesterKey] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NULL,
  [supervisorReviewerEmail] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [supervisorReviewedAt] DATETIME2(3) NULL,
  [clubReviewerEmail] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [clubReviewerRole] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [clubReviewerComment] NVARCHAR(2000) COLLATE Latin1_General_100_BIN2 NULL,
  [clubReviewedAt] DATETIME2(3) NULL,
  [reviewerEmail] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [reviewerRole] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [reviewerComment] NVARCHAR(2000) COLLATE Latin1_General_100_BIN2 NULL,
  [submittedAt] DATETIME2(3) NULL,
  [decidedAt] DATETIME2(3) NULL,
  [_id] CHAR(24) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [createdAt] DATETIME2(3) NULL,
  [updatedAt] DATETIME2(3) NULL,
  [__v] FLOAT(53) NULL,
  [_payload] NVARCHAR(MAX) NOT NULL CHECK (ISJSON([_payload]) = 1),
  [_version] BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT [PK_SpeakerRequest] PRIMARY KEY ([_id]),
  [_has_activeRequesterKey] BIT NOT NULL,
  CHECK ([hostingType] IS NULL OR [hostingType] IN (N'club', N'miu')),
  CHECK ([requesterType] IS NULL OR [requesterType] IN (N'student', N'club', N'speaker')),
  CHECK ([inviteId] IS NULL OR (LEN([inviteId]) = 24 AND [inviteId] NOT LIKE '%[^0-9a-f]%')),
  CHECK ([sessionFormat] IS NULL OR [sessionFormat] IN (N'', N'On-campus', N'Online', N'Either')),
  CHECK ([cvFormat] IS NULL OR [cvFormat] IN (N'pdf', N'doc', N'docx', N'ppt', N'pptx')),
  CHECK ([status] IS NULL OR [status] IN (N'pending', N'pending_club', N'pending_supervisor', N'pending_dean', N'approved', N'rejected', N'changes_requested')),
  CHECK ([_id] IS NULL OR (LEN([_id]) = 24 AND [_id] NOT LIKE '%[^0-9a-f]%'))
);
CREATE NONCLUSTERED INDEX [IX_SpeakerRequest_0_8ee33f] ON [dbo].[SpeakerRequest] ([clubId] ASC);
CREATE NONCLUSTERED INDEX [IX_SpeakerRequest_1_642483] ON [dbo].[SpeakerRequest] ([hostingType] ASC);
CREATE NONCLUSTERED INDEX [IX_SpeakerRequest_2_979b76] ON [dbo].[SpeakerRequest] ([requesterId] ASC);
CREATE NONCLUSTERED INDEX [IX_SpeakerRequest_3_46c04a] ON [dbo].[SpeakerRequest] ([inviteId] ASC);
CREATE NONCLUSTERED INDEX [IX_SpeakerRequest_4_587fa9] ON [dbo].[SpeakerRequest] ([status] ASC);
CREATE UNIQUE NONCLUSTERED INDEX [IX_SpeakerRequest_5_ff2c98] ON [dbo].[SpeakerRequest] ([activeRequesterKey] ASC) WHERE ([_has_activeRequesterKey] = 1);
CREATE NONCLUSTERED INDEX [IX_SpeakerRequest_6_ffbf7b] ON [dbo].[SpeakerRequest] ([status] ASC, [submittedAt] DESC);

CREATE TABLE [dbo].[StudentEmailCode] (
  [email] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [name] NVARCHAR(160) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [salt] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [passwordHash] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [codeHash] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [attempts] FLOAT(53) NULL,
  [expiresAt] DATETIME2(3) NOT NULL,
  [_id] CHAR(24) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [createdAt] DATETIME2(3) NULL,
  [updatedAt] DATETIME2(3) NULL,
  [__v] FLOAT(53) NULL,
  [_payload] NVARCHAR(MAX) NOT NULL CHECK (ISJSON([_payload]) = 1),
  [_version] BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT [PK_StudentEmailCode] PRIMARY KEY ([_id]),
  CHECK ([_id] IS NULL OR (LEN([_id]) = 24 AND [_id] NOT LIKE '%[^0-9a-f]%'))
);
CREATE UNIQUE NONCLUSTERED INDEX [IX_StudentEmailCode_0_37e5e5] ON [dbo].[StudentEmailCode] ([email] ASC);
CREATE NONCLUSTERED INDEX [IX_StudentEmailCode_1_cd5875] ON [dbo].[StudentEmailCode] ([expiresAt] ASC);

CREATE TABLE [dbo].[StudentFeedback] (
  [kind] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [targetId] FLOAT(53) NOT NULL,
  [targetKey] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [email] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [value] FLOAT(53) NOT NULL,
  [comment] NVARCHAR(1000) COLLATE Latin1_General_100_BIN2 NULL,
  [_id] CHAR(24) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [createdAt] DATETIME2(3) NULL,
  [updatedAt] DATETIME2(3) NULL,
  [__v] FLOAT(53) NULL,
  [_payload] NVARCHAR(MAX) NOT NULL CHECK (ISJSON([_payload]) = 1),
  [_version] BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT [PK_StudentFeedback] PRIMARY KEY ([_id]),
  CHECK ([kind] IS NULL OR [kind] IN (N'club', N'university')),
  CHECK ([_id] IS NULL OR (LEN([_id]) = 24 AND [_id] NOT LIKE '%[^0-9a-f]%'))
);
CREATE UNIQUE NONCLUSTERED INDEX [IX_StudentFeedback_0_6fa953] ON [dbo].[StudentFeedback] ([kind] ASC, [targetKey] ASC, [email] ASC);
CREATE UNIQUE NONCLUSTERED INDEX [IX_StudentFeedback_legacy_0_65194d] ON [dbo].[StudentFeedback] ([kind] ASC, [targetId] ASC, [email] ASC);

CREATE TABLE [dbo].[StudentInterest] (
  [studentEmail] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [clubId] BIGINT NOT NULL,
  [eventIndex] BIGINT NOT NULL,
  [eventTitle] NVARCHAR(140) COLLATE Latin1_General_100_BIN2 NULL,
  [detailViews] FLOAT(53) NULL,
  [registered] BIT NULL,
  [lastViewedAt] DATETIME2(3) NULL,
  [_id] CHAR(24) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [createdAt] DATETIME2(3) NULL,
  [updatedAt] DATETIME2(3) NULL,
  [__v] FLOAT(53) NULL,
  [_payload] NVARCHAR(MAX) NOT NULL CHECK (ISJSON([_payload]) = 1),
  [_version] BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT [PK_StudentInterest] PRIMARY KEY ([_id]),
  CHECK ([_id] IS NULL OR (LEN([_id]) = 24 AND [_id] NOT LIKE '%[^0-9a-f]%'))
);
CREATE UNIQUE NONCLUSTERED INDEX [IX_StudentInterest_0_7889f6] ON [dbo].[StudentInterest] ([studentEmail] ASC, [clubId] ASC, [eventIndex] ASC);
CREATE NONCLUSTERED INDEX [IX_StudentInterest_1_306ef9] ON [dbo].[StudentInterest] ([clubId] ASC, [eventIndex] ASC);

CREATE TABLE [dbo].[SupervisorReview] (
  [supervisorId] CHAR(24) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [supervisorEmail] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [clubId] BIGINT NOT NULL,
  [targetType] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [targetId] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [note] NVARCHAR(2000) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [_id] CHAR(24) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [createdAt] DATETIME2(3) NULL,
  [updatedAt] DATETIME2(3) NULL,
  [__v] FLOAT(53) NULL,
  [_payload] NVARCHAR(MAX) NOT NULL CHECK (ISJSON([_payload]) = 1),
  [_version] BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT [PK_SupervisorReview] PRIMARY KEY ([_id]),
  CHECK ([supervisorId] IS NULL OR (LEN([supervisorId]) = 24 AND [supervisorId] NOT LIKE '%[^0-9a-f]%')),
  CHECK ([targetType] IS NULL OR [targetType] IN (N'content', N'speaker')),
  CHECK ([_id] IS NULL OR (LEN([_id]) = 24 AND [_id] NOT LIKE '%[^0-9a-f]%'))
);
CREATE NONCLUSTERED INDEX [IX_SupervisorReview_0_8ee33f] ON [dbo].[SupervisorReview] ([clubId] ASC);
CREATE UNIQUE NONCLUSTERED INDEX [IX_SupervisorReview_1_82733a] ON [dbo].[SupervisorReview] ([supervisorId] ASC, [clubId] ASC, [targetType] ASC, [targetId] ASC);

CREATE TABLE [dbo].[UniversityContent] (
  [interaction] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [question] NVARCHAR(300) COLLATE Latin1_General_100_BIN2 NULL,
  [id] BIGINT NOT NULL,
  [type] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [title] NVARCHAR(140) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [description] NVARCHAR(2000) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [date] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [time] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [registrationEnabled] BIT NULL,
  [attendanceEnabled] BIT NULL,
  [attendanceAudience] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NULL,
  [location] NVARCHAR(160) COLLATE Latin1_General_100_BIN2 NULL,
  [image] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [imagePublicId] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [publishedBy] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL,
  [_id] CHAR(24) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [createdAt] DATETIME2(3) NULL,
  [updatedAt] DATETIME2(3) NULL,
  [__v] FLOAT(53) NULL,
  [_payload] NVARCHAR(MAX) NOT NULL CHECK (ISJSON([_payload]) = 1),
  [_version] BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT [PK_UniversityContent] PRIMARY KEY ([_id]),
  CHECK ([interaction] IS NULL OR [interaction] IN (N'none', N'poll', N'evaluation')),
  CHECK ([type] IS NULL OR [type] IN (N'event', N'announcement')),
  CHECK ([attendanceAudience] IS NULL OR [attendanceAudience] IN (N'members', N'all_students')),
  CHECK ([_id] IS NULL OR (LEN([_id]) = 24 AND [_id] NOT LIKE '%[^0-9a-f]%'))
);
CREATE UNIQUE NONCLUSTERED INDEX [IX_UniversityContent_0_037c92] ON [dbo].[UniversityContent] ([id] ASC);
CREATE NONCLUSTERED INDEX [IX_UniversityContent_1_e126f1] ON [dbo].[UniversityContent] ([type] ASC);
CREATE NONCLUSTERED INDEX [IX_UniversityContent_2_196406] ON [dbo].[UniversityContent] ([attendanceAudience] ASC);
CREATE NONCLUSTERED INDEX [IX_UniversityContent_3_4e977d] ON [dbo].[UniversityContent] ([createdAt] DESC, [id] DESC);
ALTER TABLE [dbo].[ClubAccount] ADD [_clubReference] BIGINT NULL;
ALTER TABLE [dbo].[ClubAccount] ADD CONSTRAINT [CK_ClubAccount_clubReference] CHECK (([clubId] IS NULL AND [_clubReference] IS NULL) OR ([clubId] = 0 AND [_clubReference] IS NULL) OR ([clubId] <> 0 AND [_clubReference] = [clubId] AND [_clubReference] IS NOT NULL));
ALTER TABLE [dbo].[ClubAccount] ADD CONSTRAINT [FK_ClubAccount_Club] FOREIGN KEY ([_clubReference]) REFERENCES [dbo].[Club] ([id]);
ALTER TABLE [dbo].[SpeakerInvite] ADD [_clubReference] BIGINT NULL;
ALTER TABLE [dbo].[SpeakerInvite] ADD CONSTRAINT [CK_SpeakerInvite_clubReference] CHECK (([clubId] IS NULL AND [_clubReference] IS NULL) OR ([clubId] = 0 AND [_clubReference] IS NULL) OR ([clubId] <> 0 AND [_clubReference] = [clubId] AND [_clubReference] IS NOT NULL));
ALTER TABLE [dbo].[SpeakerInvite] ADD CONSTRAINT [FK_SpeakerInvite_Club] FOREIGN KEY ([_clubReference]) REFERENCES [dbo].[Club] ([id]);
ALTER TABLE [dbo].[AttendanceSession] ADD [_clubReference] BIGINT NULL;
ALTER TABLE [dbo].[AttendanceSession] ADD CONSTRAINT [CK_AttendanceSession_clubReference] CHECK (([clubId] IS NULL AND [_clubReference] IS NULL) OR ([clubId] = 0 AND [_clubReference] IS NULL) OR ([clubId] <> 0 AND [_clubReference] = [clubId] AND [_clubReference] IS NOT NULL));
ALTER TABLE [dbo].[AttendanceSession] ADD CONSTRAINT [FK_AttendanceSession_Club] FOREIGN KEY ([_clubReference]) REFERENCES [dbo].[Club] ([id]);
ALTER TABLE [dbo].[Application] ADD CONSTRAINT [FK_Application_studentAccountId] FOREIGN KEY ([studentAccountId]) REFERENCES [dbo].[StudentAccount] ([_id]);
ALTER TABLE [dbo].[Application] ADD [_clubReference] BIGINT NULL;
ALTER TABLE [dbo].[Application] ADD CONSTRAINT [CK_Application_clubReference] CHECK (([clubId] IS NULL AND [_clubReference] IS NULL) OR ([clubId] = 0 AND [_clubReference] IS NULL) OR ([clubId] <> 0 AND [_clubReference] = [clubId] AND [_clubReference] IS NOT NULL));
ALTER TABLE [dbo].[Application] ADD CONSTRAINT [FK_Application_Club] FOREIGN KEY ([_clubReference]) REFERENCES [dbo].[Club] ([id]);
ALTER TABLE [dbo].[AttendanceActivityClosure] ADD [_clubReference] BIGINT NULL;
ALTER TABLE [dbo].[AttendanceActivityClosure] ADD CONSTRAINT [CK_AttendanceActivityClosure_clubReference] CHECK (([clubId] IS NULL AND [_clubReference] IS NULL) OR ([clubId] = 0 AND [_clubReference] IS NULL) OR ([clubId] <> 0 AND [_clubReference] = [clubId] AND [_clubReference] IS NOT NULL));
ALTER TABLE [dbo].[AttendanceActivityClosure] ADD CONSTRAINT [FK_AttendanceActivityClosure_Club] FOREIGN KEY ([_clubReference]) REFERENCES [dbo].[Club] ([id]);
ALTER TABLE [dbo].[AttendanceAssignment] ADD [_clubReference] BIGINT NULL;
ALTER TABLE [dbo].[AttendanceAssignment] ADD CONSTRAINT [CK_AttendanceAssignment_clubReference] CHECK (([clubId] IS NULL AND [_clubReference] IS NULL) OR ([clubId] = 0 AND [_clubReference] IS NULL) OR ([clubId] <> 0 AND [_clubReference] = [clubId] AND [_clubReference] IS NOT NULL));
ALTER TABLE [dbo].[AttendanceAssignment] ADD CONSTRAINT [FK_AttendanceAssignment_Club] FOREIGN KEY ([_clubReference]) REFERENCES [dbo].[Club] ([id]);
ALTER TABLE [dbo].[AttendanceRecord] ADD CONSTRAINT [FK_AttendanceRecord_sessionId] FOREIGN KEY ([sessionId]) REFERENCES [dbo].[AttendanceSession] ([_id]);
ALTER TABLE [dbo].[AttendanceRecord] ADD [_clubReference] BIGINT NULL;
ALTER TABLE [dbo].[AttendanceRecord] ADD CONSTRAINT [CK_AttendanceRecord_clubReference] CHECK (([clubId] IS NULL AND [_clubReference] IS NULL) OR ([clubId] = 0 AND [_clubReference] IS NULL) OR ([clubId] <> 0 AND [_clubReference] = [clubId] AND [_clubReference] IS NOT NULL));
ALTER TABLE [dbo].[AttendanceRecord] ADD CONSTRAINT [FK_AttendanceRecord_Club] FOREIGN KEY ([_clubReference]) REFERENCES [dbo].[Club] ([id]);
ALTER TABLE [dbo].[ContentRequest] ADD [_clubReference] BIGINT NULL;
ALTER TABLE [dbo].[ContentRequest] ADD CONSTRAINT [CK_ContentRequest_clubReference] CHECK (([clubId] IS NULL AND [_clubReference] IS NULL) OR ([clubId] = 0 AND [_clubReference] IS NULL) OR ([clubId] <> 0 AND [_clubReference] = [clubId] AND [_clubReference] IS NOT NULL));
ALTER TABLE [dbo].[ContentRequest] ADD CONSTRAINT [FK_ContentRequest_Club] FOREIGN KEY ([_clubReference]) REFERENCES [dbo].[Club] ([id]);
ALTER TABLE [dbo].[EventRegistration] ADD CONSTRAINT [FK_EventRegistration_studentAccountId] FOREIGN KEY ([studentAccountId]) REFERENCES [dbo].[StudentAccount] ([_id]);
ALTER TABLE [dbo].[EventRegistration] ADD [_clubReference] BIGINT NULL;
ALTER TABLE [dbo].[EventRegistration] ADD CONSTRAINT [CK_EventRegistration_clubReference] CHECK (([clubId] IS NULL AND [_clubReference] IS NULL) OR ([clubId] = 0 AND [_clubReference] IS NULL) OR ([clubId] <> 0 AND [_clubReference] = [clubId] AND [_clubReference] IS NOT NULL));
ALTER TABLE [dbo].[EventRegistration] ADD CONSTRAINT [FK_EventRegistration_Club] FOREIGN KEY ([_clubReference]) REFERENCES [dbo].[Club] ([id]);
ALTER TABLE [dbo].[EventReport] ADD [_clubReference] BIGINT NULL;
ALTER TABLE [dbo].[EventReport] ADD CONSTRAINT [CK_EventReport_clubReference] CHECK (([clubId] IS NULL AND [_clubReference] IS NULL) OR ([clubId] = 0 AND [_clubReference] IS NULL) OR ([clubId] <> 0 AND [_clubReference] = [clubId] AND [_clubReference] IS NOT NULL));
ALTER TABLE [dbo].[EventReport] ADD CONSTRAINT [FK_EventReport_Club] FOREIGN KEY ([_clubReference]) REFERENCES [dbo].[Club] ([id]);
ALTER TABLE [dbo].[SpeakerRequest] ADD CONSTRAINT [FK_SpeakerRequest_inviteId] FOREIGN KEY ([inviteId]) REFERENCES [dbo].[SpeakerInvite] ([_id]);
ALTER TABLE [dbo].[SpeakerRequest] ADD [_clubReference] BIGINT NULL;
ALTER TABLE [dbo].[SpeakerRequest] ADD CONSTRAINT [CK_SpeakerRequest_clubReference] CHECK (([clubId] IS NULL AND [_clubReference] IS NULL) OR ([clubId] = 0 AND [_clubReference] IS NULL) OR ([clubId] <> 0 AND [_clubReference] = [clubId] AND [_clubReference] IS NOT NULL));
ALTER TABLE [dbo].[SpeakerRequest] ADD CONSTRAINT [FK_SpeakerRequest_Club] FOREIGN KEY ([_clubReference]) REFERENCES [dbo].[Club] ([id]);
ALTER TABLE [dbo].[StudentInterest] ADD [_clubReference] BIGINT NULL;
ALTER TABLE [dbo].[StudentInterest] ADD CONSTRAINT [CK_StudentInterest_clubReference] CHECK (([clubId] IS NULL AND [_clubReference] IS NULL) OR ([clubId] = 0 AND [_clubReference] IS NULL) OR ([clubId] <> 0 AND [_clubReference] = [clubId] AND [_clubReference] IS NOT NULL));
ALTER TABLE [dbo].[StudentInterest] ADD CONSTRAINT [FK_StudentInterest_Club] FOREIGN KEY ([_clubReference]) REFERENCES [dbo].[Club] ([id]);
ALTER TABLE [dbo].[SupervisorReview] ADD [_supervisorReference] CHAR(24) COLLATE Latin1_General_100_BIN2 NULL;
ALTER TABLE [dbo].[SupervisorReview] ADD CONSTRAINT [FK_SupervisorReview_CurrentSupervisor] FOREIGN KEY ([_supervisorReference]) REFERENCES [dbo].[ClubAccount] ([_id]) ON DELETE SET NULL;
ALTER TABLE [dbo].[SupervisorReview] ADD [_clubReference] BIGINT NULL;
ALTER TABLE [dbo].[SupervisorReview] ADD CONSTRAINT [CK_SupervisorReview_clubReference] CHECK (([clubId] IS NULL AND [_clubReference] IS NULL) OR ([clubId] = 0 AND [_clubReference] IS NULL) OR ([clubId] <> 0 AND [_clubReference] = [clubId] AND [_clubReference] IS NOT NULL));
ALTER TABLE [dbo].[SupervisorReview] ADD CONSTRAINT [FK_SupervisorReview_Club] FOREIGN KEY ([_clubReference]) REFERENCES [dbo].[Club] ([id]);
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
