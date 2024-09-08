CREATE TABLE `api_key_service` (
	`api_key_id` integer NOT NULL,
	`service_id` integer NOT NULL,
	FOREIGN KEY (`api_key_id`) REFERENCES `api_key`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`service_id`) REFERENCES `service`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `api_key` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`prefix` text NOT NULL,
	`hashed_key` text NOT NULL,
	`created_by` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`expired_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user_account`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `role` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `service` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`hash` text NOT NULL,
	`config` text NOT NULL,
	`is_public` integer,
	`created_by` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `user_account`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_account` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password` text NOT NULL,
	`role_id` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `role`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `api_key_service_api_key_idx` ON `api_key_service` (`api_key_id`);--> statement-breakpoint
CREATE INDEX `api_key_service_service_idx` ON `api_key_service` (`service_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `api_key_prefix_unique` ON `api_key` (`prefix`);--> statement-breakpoint
CREATE UNIQUE INDEX `api_key_hashed_key_unique` ON `api_key` (`hashed_key`);--> statement-breakpoint
CREATE INDEX `prefix_expired_idx` ON `api_key` (`prefix`,`expired_at`);--> statement-breakpoint
CREATE INDEX `expired_key_idx` ON `api_key` (`expired_at`) WHERE expired_at < unixepoch();--> statement-breakpoint
CREATE UNIQUE INDEX `role_name_unique` ON `role` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `service_hash_unique` ON `service` (`hash`);--> statement-breakpoint
CREATE INDEX `name_type_idx` ON `service` (`name`,`type`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_account_username_unique` ON `user_account` (`username`);