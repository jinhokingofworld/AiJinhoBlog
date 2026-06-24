CREATE TABLE `AiRateLimitBucket` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `endpoint` VARCHAR(120) NOT NULL,
  `windowStart` DATETIME(3) NOT NULL,
  `requestCount` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `AiRateLimitBucket_userId_endpoint_windowStart_key`
  ON `AiRateLimitBucket`(`userId`, `endpoint`, `windowStart`);

CREATE INDEX `AiRateLimitBucket_userId_endpoint_windowStart_idx`
  ON `AiRateLimitBucket`(`userId`, `endpoint`, `windowStart`);

ALTER TABLE `AiRateLimitBucket`
  ADD CONSTRAINT `AiRateLimitBucket_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
