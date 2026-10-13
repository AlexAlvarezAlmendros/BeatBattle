CREATE TABLE `result` (
	`week_id` text NOT NULL,
	`revision` integer NOT NULL,
	`entry_id` text NOT NULL,
	`position` integer,
	`score_milli` integer NOT NULL,
	`votes` integer NOT NULL,
	`mean_milli` integer NOT NULL,
	`median_half` integer NOT NULL,
	`histogram` text NOT NULL,
	`season_points` integer NOT NULL,
	PRIMARY KEY(`week_id`, `revision`, `entry_id`)
);
--> statement-breakpoint
CREATE INDEX `result_entry` ON `result` (`entry_id`);