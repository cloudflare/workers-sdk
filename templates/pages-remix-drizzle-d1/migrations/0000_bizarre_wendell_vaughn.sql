CREATE TABLE `articles` (
	`slug` text PRIMARY KEY NOT NULL,
	`title` text,
	`excerpt` text,
	`content` text,
	`author` text,
	`published_on` integer,
	`created_at` integer
);

CREATE UNIQUE INDEX `slugIdx` ON `articles` (`slug`);
CREATE UNIQUE INDEX `nameIdx` ON `articles` (`title`);