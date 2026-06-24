CREATE TABLE `NotionPageDocument` (
  `id` VARCHAR(191) NOT NULL,
  `ownerId` VARCHAR(191) NOT NULL,
  `notionPageId` VARCHAR(191) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `url` VARCHAR(1024) NULL,
  `lastEditedAt` DATETIME(3) NULL,
  `contentHash` CHAR(64) NULL,
  `plainText` LONGTEXT NOT NULL,
  `lastSyncedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `NotionPageVectorIndex` (
  `id` VARCHAR(191) NOT NULL,
  `documentId` VARCHAR(191) NOT NULL,
  `ownerId` VARCHAR(191) NOT NULL,
  `status` ENUM('PENDING', 'INDEXED', 'SKIPPED', 'FAILED', 'DELETED') NOT NULL DEFAULT 'PENDING',
  `contentHash` CHAR(64) NULL,
  `chunkCount` INTEGER NOT NULL DEFAULT 0,
  `chunkIds` JSON NULL,
  `errorMessage` TEXT NULL,
  `lastIndexedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AiRequestLog`
  ADD COLUMN `notionPageDocumentId` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `NotionPageDocument_ownerId_notionPageId_key`
  ON `NotionPageDocument`(`ownerId`, `notionPageId`);

CREATE INDEX `NotionPageDocument_ownerId_updatedAt_idx`
  ON `NotionPageDocument`(`ownerId`, `updatedAt`);

CREATE UNIQUE INDEX `NotionPageVectorIndex_documentId_key`
  ON `NotionPageVectorIndex`(`documentId`);

CREATE INDEX `NotionPageVectorIndex_ownerId_status_idx`
  ON `NotionPageVectorIndex`(`ownerId`, `status`);

CREATE INDEX `NotionPageVectorIndex_updatedAt_idx`
  ON `NotionPageVectorIndex`(`updatedAt`);

CREATE INDEX `AiRequestLog_notionPageDocumentId_createdAt_idx`
  ON `AiRequestLog`(`notionPageDocumentId`, `createdAt`);

ALTER TABLE `NotionPageDocument`
  ADD CONSTRAINT `NotionPageDocument_ownerId_fkey`
  FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `NotionPageVectorIndex`
  ADD CONSTRAINT `NotionPageVectorIndex_documentId_fkey`
  FOREIGN KEY (`documentId`) REFERENCES `NotionPageDocument`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `NotionPageVectorIndex`
  ADD CONSTRAINT `NotionPageVectorIndex_ownerId_fkey`
  FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `AiRequestLog`
  ADD CONSTRAINT `AiRequestLog_notionPageDocumentId_fkey`
  FOREIGN KEY (`notionPageDocumentId`) REFERENCES `NotionPageDocument`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
