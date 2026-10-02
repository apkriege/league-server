UPDATE "player"
SET "type" = 'player'
WHERE LOWER(TRIM("type")) IN ('captain', 'captian');

UPDATE "player"
SET "type" = 'substitute'
WHERE LOWER(TRIM("type")) = 'sub';
