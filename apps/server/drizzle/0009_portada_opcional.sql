PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_sample` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`credits` text NOT NULL,
	`origin` text,
	`license_text` text NOT NULL,
	`bpm` real,
	`musical_key` text,
	`genre_hint` text,
	`duration_ms` integer NOT NULL,
	`bytes` integer NOT NULL,
	`format` text NOT NULL,
	`audio_public_id` text NOT NULL,
	`stems_public_id` text,
	`cover_public_id` text,
	`peaks` blob NOT NULL,
	`loudness_lufs` real,
	`chops` text DEFAULT '[]' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_sample`("id", "title", "credits", "origin", "license_text", "bpm", "musical_key", "genre_hint", "duration_ms", "bytes", "format", "audio_public_id", "stems_public_id", "cover_public_id", "peaks", "loudness_lufs", "chops", "created_by", "created_at") SELECT "id", "title", "credits", "origin", "license_text", "bpm", "musical_key", "genre_hint", "duration_ms", "bytes", "format", "audio_public_id", "stems_public_id", "cover_public_id", "peaks", "loudness_lufs", "chops", "created_by", "created_at" FROM `sample`;--> statement-breakpoint
DROP TABLE `sample`;--> statement-breakpoint
ALTER TABLE `__new_sample` RENAME TO `sample`;--> statement-breakpoint
PRAGMA foreign_keys=ON;