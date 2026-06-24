ALTER TABLE `Post`
  ADD COLUMN `status` ENUM('DRAFT', 'PUBLISHED') NOT NULL DEFAULT 'PUBLISHED',
  ADD COLUMN `visibility` ENUM('PUBLIC', 'PRIVATE') NOT NULL DEFAULT 'PUBLIC',
  ADD COLUMN `publishedAt` DATETIME(3) NULL;

UPDATE `Post`
SET `publishedAt` = `createdAt`
WHERE `publishedAt` IS NULL;

CREATE INDEX `Post_authorId_status_visibility_createdAt_idx`
  ON `Post`(`authorId`, `status`, `visibility`, `createdAt`);
