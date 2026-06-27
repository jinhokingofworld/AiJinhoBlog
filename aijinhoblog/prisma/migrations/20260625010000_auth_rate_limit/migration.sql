CREATE TABLE `AuthRateLimitBucket` (
  `id` VARCHAR(191) NOT NULL,
  `endpoint` VARCHAR(80) NOT NULL,
  `ipHash` CHAR(64) NOT NULL,
  `identifierHash` CHAR(64) NOT NULL,
  `windowStart` DATETIME(3) NOT NULL,
  `requestCount` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `auth_rate_limit_bucket_unique`
    (`endpoint`, `ipHash`, `identifierHash`, `windowStart`),
  INDEX `auth_rate_limit_bucket_lookup_idx`
    (`endpoint`, `ipHash`, `windowStart`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
