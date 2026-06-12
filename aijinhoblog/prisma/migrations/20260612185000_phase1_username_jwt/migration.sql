ALTER TABLE `User` ADD COLUMN `username` VARCHAR(30) NULL;

UPDATE `User`
SET `username` = CONCAT('user-', LEFT(`id`, 8))
WHERE `username` IS NULL;

ALTER TABLE `User` MODIFY `username` VARCHAR(30) NOT NULL;

CREATE UNIQUE INDEX `User_username_key` ON `User`(`username`);
