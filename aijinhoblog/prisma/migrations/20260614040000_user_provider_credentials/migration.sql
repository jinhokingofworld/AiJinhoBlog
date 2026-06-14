CREATE TABLE `ExternalProviderCredential` (
  `id` VARCHAR(191) NOT NULL,
  `ownerId` VARCHAR(191) NOT NULL,
  `provider` ENUM('DROPBOX', 'NOTION') NOT NULL,
  `appKeyCiphertext` TEXT NOT NULL,
  `appSecretCiphertext` TEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `ExternalProviderCredential_ownerId_provider_key`
  ON `ExternalProviderCredential`(`ownerId`, `provider`);

CREATE INDEX `ExternalProviderCredential_ownerId_updatedAt_idx`
  ON `ExternalProviderCredential`(`ownerId`, `updatedAt`);

ALTER TABLE `ExternalProviderCredential`
  ADD CONSTRAINT `ExternalProviderCredential_ownerId_fkey`
  FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
