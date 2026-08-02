-- Player email is optional when building a league roster.
ALTER TABLE "player" ALTER COLUMN "email" DROP NOT NULL;
