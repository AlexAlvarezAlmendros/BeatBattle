CREATE TABLE `email_consent` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`subscriber_id` text,
	`purpose` text NOT NULL,
	`granted` integer NOT NULL,
	`text_version` text NOT NULL,
	`source` text NOT NULL,
	`ip_hash` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `email_consent_user` ON `email_consent` (`user_id`,`purpose`,`created_at`);--> statement-breakpoint
CREATE TABLE `email_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`idempotency_key` text NOT NULL,
	`user_id` text,
	`subscriber_id` text,
	`campaign_id` text,
	`to_address` text,
	`kind` text NOT NULL,
	`family` text NOT NULL,
	`priority` integer NOT NULL,
	`payload` text NOT NULL,
	`status` text NOT NULL,
	`skip_reason` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`not_before` integer NOT NULL,
	`provider_id` text,
	`created_at` integer NOT NULL,
	`sent_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_outbox_idempotency_key_unique` ON `email_outbox` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `email_outbox_due` ON `email_outbox` (`status`,`not_before`);--> statement-breakpoint
CREATE INDEX `email_outbox_sent` ON `email_outbox` (`sent_at`);--> statement-breakpoint
CREATE TABLE `email_pref` (
	`user_id` text PRIMARY KEY NOT NULL,
	`monday_format` text DEFAULT 'combined' NOT NULL,
	`drop_on` integer DEFAULT true NOT NULL,
	`results_on` integer DEFAULT true NOT NULL,
	`reminder_on` integer DEFAULT true NOT NULL,
	`jury_call_on` integer DEFAULT true NOT NULL,
	`first_votes_on` integer DEFAULT true NOT NULL,
	`label_pick_on` integer DEFAULT true NOT NULL,
	`progress_on` integer DEFAULT true NOT NULL,
	`season_on` integer DEFAULT true NOT NULL,
	`marketing_on` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `email_stat` (
	`scope` text NOT NULL,
	`day` text NOT NULL,
	`metric` text NOT NULL,
	`count` integer NOT NULL,
	PRIMARY KEY(`scope`, `day`, `metric`)
);
--> statement-breakpoint
CREATE TABLE `email_subscriber` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`status` text NOT NULL,
	`confirm_token_hash` text,
	`merged_user_id` text,
	`created_at` integer NOT NULL,
	`confirmed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_subscriber_email_unique` ON `email_subscriber` (`email`);--> statement-breakpoint
CREATE TABLE `email_suppression` (
	`email_hash` text PRIMARY KEY NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL
);
