CREATE TABLE `Folder` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(80) NOT NULL,
  `position` INTEGER NOT NULL DEFAULT 0,
  `isDefault` BOOLEAN NOT NULL DEFAULT false,
  `ownerId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `Folder_ownerId_name_key`(`ownerId`, `name`),
  INDEX `Folder_ownerId_position_idx`(`ownerId`, `position`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Post` ADD COLUMN `folderId` VARCHAR(191) NULL;

CREATE INDEX `Post_folderId_idx` ON `Post`(`folderId`);

ALTER TABLE `Folder`
  ADD CONSTRAINT `Folder_ownerId_fkey`
  FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `Post`
  ADD CONSTRAINT `Post_folderId_fkey`
  FOREIGN KEY (`folderId`) REFERENCES `Folder`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
