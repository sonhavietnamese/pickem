CREATE TABLE "streamers" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL
);
--> statement-breakpoint
DROP TABLE "users" CASCADE;