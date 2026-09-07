ALTER TABLE "round"
ADD COLUMN "playing_handicap" INTEGER,
ADD COLUMN "competition_gross" INTEGER,
ADD COLUMN "competition_net" INTEGER;

ALTER TABLE "score"
ADD COLUMN "competition_gross" INTEGER,
ADD COLUMN "competition_net" INTEGER,
ADD COLUMN "competition_pops" INTEGER;
