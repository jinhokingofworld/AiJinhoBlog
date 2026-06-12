CREATE TABLE `PostVectorIndex` (
  `id` VARCHAR(191) NOT NULL,
  `postId` VARCHAR(191) NOT NULL,
  `authorId` VARCHAR(191) NOT NULL,
  `status` ENUM('PENDING', 'INDEXED', 'SKIPPED', 'FAILED', 'DELETED') NOT NULL DEFAULT 'PENDING',
  `contentHash` CHAR(64) NULL,
  `chunkCount` INTEGER NOT NULL DEFAULT 0,
  `chunkIds` JSON NULL,
  `errorMessage` TEXT NULL,
  `lastIndexedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `PostVectorIndex_postId_key`(`postId`),
  INDEX `PostVectorIndex_authorId_status_idx`(`authorId`, `status`),
  INDEX `PostVectorIndex_updatedAt_idx`(`updatedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AiRequestLog` (
  `id` VARCHAR(191) NOT NULL,
  `purpose` VARCHAR(80) NOT NULL,
  `provider` VARCHAR(40) NOT NULL,
  `model` VARCHAR(100) NULL,
  `status` ENUM('SUCCESS', 'SKIPPED', 'FAILED') NOT NULL,
  `inputTokens` INTEGER NULL,
  `outputTokens` INTEGER NULL,
  `totalTokens` INTEGER NULL,
  `errorMessage` TEXT NULL,
  `metadata` JSON NULL,
  `postId` VARCHAR(191) NULL,
  `userId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `AiRequestLog_postId_createdAt_idx`(`postId`, `createdAt`),
  INDEX `AiRequestLog_userId_createdAt_idx`(`userId`, `createdAt`),
  INDEX `AiRequestLog_purpose_status_createdAt_idx`(`purpose`, `status`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PostVectorIndex`
  ADD CONSTRAINT `PostVectorIndex_postId_fkey`
  FOREIGN KEY (`postId`) REFERENCES `Post`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `PostVectorIndex`
  ADD CONSTRAINT `PostVectorIndex_authorId_fkey`
  FOREIGN KEY (`authorId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `AiRequestLog`
  ADD CONSTRAINT `AiRequestLog_postId_fkey`
  FOREIGN KEY (`postId`) REFERENCES `Post`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `AiRequestLog`
  ADD CONSTRAINT `AiRequestLog_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
