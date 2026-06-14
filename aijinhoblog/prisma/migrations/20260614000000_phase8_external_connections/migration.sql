CREATE TABLE `ExternalKnowledgeConnection` (
  `id` VARCHAR(191) NOT NULL,
  `ownerId` VARCHAR(191) NOT NULL,
  `provider` ENUM('DROPBOX', 'NOTION') NOT NULL,
  `providerAccountId` VARCHAR(191) NULL,
  `providerAccountName` VARCHAR(191) NULL,
  `scope` VARCHAR(512) NULL,
  `accessTokenCiphertext` TEXT NOT NULL,
  `refreshTokenCiphertext` TEXT NULL,
  `expiresAt` DATETIME(3) NULL,
  `status` ENUM('CONNECTED', 'DISCONNECTED', 'ERROR') NOT NULL DEFAULT 'CONNECTED',
  `lastSyncedAt` DATETIME(3) NULL,
  `lastError` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `ExternalKnowledgeConnection_ownerId_provider_key`
  ON `ExternalKnowledgeConnection`(`ownerId`, `provider`);

CREATE INDEX `ExternalKnowledgeConnection_ownerId_status_idx`
  ON `ExternalKnowledgeConnection`(`ownerId`, `status`);

ALTER TABLE `ExternalKnowledgeConnection`
  ADD CONSTRAINT `ExternalKnowledgeConnection_ownerId_fkey`
  FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
