CREATE TABLE `WritingStyleProfile` (
  `id` VARCHAR(191) NOT NULL,
  `ownerId` VARCHAR(191) NOT NULL,
  `toneSummary` TEXT NOT NULL,
  `sentenceSummary` TEXT NOT NULL,
  `frequentExpressions` JSON NULL,
  `samplePostIds` JSON NULL,
  `lastAnalyzedAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `WritingStyleProfile_ownerId_key`(`ownerId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `WritingRefactorResult` (
  `id` VARCHAR(191) NOT NULL,
  `ownerId` VARCHAR(191) NOT NULL,
  `postId` VARCHAR(191) NULL,
  `mode` VARCHAR(40) NOT NULL,
  `originalText` LONGTEXT NOT NULL,
  `revisedText` LONGTEXT NOT NULL,
  `changeSummary` TEXT NOT NULL,
  `appliedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `WritingRefactorResult_ownerId_createdAt_idx`(`ownerId`, `createdAt`),
  INDEX `WritingRefactorResult_postId_idx`(`postId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `WritingStyleProfile`
  ADD CONSTRAINT `WritingStyleProfile_ownerId_fkey`
  FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `WritingRefactorResult`
  ADD CONSTRAINT `WritingRefactorResult_ownerId_fkey`
  FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `WritingRefactorResult`
  ADD CONSTRAINT `WritingRefactorResult_postId_fkey`
  FOREIGN KEY (`postId`) REFERENCES `Post`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
