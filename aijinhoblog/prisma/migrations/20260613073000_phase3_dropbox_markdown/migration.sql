CREATE TABLE `DropboxMarkdownDocument` (
  `id` VARCHAR(191) NOT NULL,
  `ownerId` VARCHAR(191) NOT NULL,
  `dropboxFileId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `pathDisplay` VARCHAR(512) NOT NULL,
  `pathLower` VARCHAR(512) NOT NULL,
  `rev` VARCHAR(100) NULL,
  `serverModified` DATETIME(3) NULL,
  `size` INTEGER NULL,
  `contentHash` CHAR(64) NULL,
  `markdown` LONGTEXT NOT NULL,
  `plainText` LONGTEXT NOT NULL,
  `lastSyncedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `DropboxMarkdownDocument_ownerId_pathLower_key`(`ownerId`, `pathLower`),
  INDEX `DropboxMarkdownDocument_ownerId_updatedAt_idx`(`ownerId`, `updatedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DropboxMarkdownVectorIndex` (
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

  UNIQUE INDEX `DropboxMarkdownVectorIndex_documentId_key`(`documentId`),
  INDEX `DropboxMarkdownVectorIndex_ownerId_status_idx`(`ownerId`, `status`),
  INDEX `DropboxMarkdownVectorIndex_updatedAt_idx`(`updatedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AiRequestLog`
  ADD COLUMN `dropboxMarkdownDocumentId` VARCHAR(191) NULL,
  ADD INDEX `AiRequestLog_dropboxMarkdownDocumentId_createdAt_idx`(`dropboxMarkdownDocumentId`, `createdAt`);

ALTER TABLE `DropboxMarkdownDocument`
  ADD CONSTRAINT `DropboxMarkdownDocument_ownerId_fkey`
  FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `DropboxMarkdownVectorIndex`
  ADD CONSTRAINT `DropboxMarkdownVectorIndex_documentId_fkey`
  FOREIGN KEY (`documentId`) REFERENCES `DropboxMarkdownDocument`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `DropboxMarkdownVectorIndex`
  ADD CONSTRAINT `DropboxMarkdownVectorIndex_ownerId_fkey`
  FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `AiRequestLog`
  ADD CONSTRAINT `AiRequestLog_dropboxMarkdownDocumentId_fkey`
  FOREIGN KEY (`dropboxMarkdownDocumentId`) REFERENCES `DropboxMarkdownDocument`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
