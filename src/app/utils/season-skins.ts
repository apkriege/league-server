export type SeasonSkinScore = {
  eventId: number;
  hole: number;
  playerId: number;
  playerName: string;
  gross: number;
  net: number;
};

export type SeasonSkinLeaderboardEntry = {
  playerId: number;
  name: string;
  skins: number;
};

const buildLeaderboard = (
  scores: SeasonSkinScore[],
  scoreType: 'gross' | 'net',
  limit: number,
): SeasonSkinLeaderboardEntry[] => {
  const scoresByEventHole = new Map<string, SeasonSkinScore[]>();

  for (const score of scores) {
    const value = Number(score[scoreType]);
    if (!Number.isFinite(value) || value <= 0) continue;

    const key = `${score.eventId}-${score.hole}`;
    const entries = scoresByEventHole.get(key) ?? [];
    entries.push(score);
    scoresByEventHole.set(key, entries);
  }

  const counts = new Map<number, SeasonSkinLeaderboardEntry>();
  for (const entries of scoresByEventHole.values()) {
    if (entries.length < 2) continue;

    const lowestScore = Math.min(...entries.map((entry) => Number(entry[scoreType])));
    const winners = entries.filter((entry) => Number(entry[scoreType]) === lowestScore);
    if (winners.length !== 1) continue;

    const winner = winners[0];
    const existing = counts.get(winner.playerId);
    if (existing) {
      existing.skins += 1;
    } else {
      counts.set(winner.playerId, {
        playerId: winner.playerId,
        name: winner.playerName,
        skins: 1,
      });
    }
  }

  return [...counts.values()]
    .sort((left, right) => right.skins - left.skins || left.name.localeCompare(right.name))
    .slice(0, limit);
};

export const calculateSeasonSkinLeaderboards = (
  scores: SeasonSkinScore[],
  limit = 3,
) => ({
  gross: buildLeaderboard(scores, 'gross', limit),
  net: buildLeaderboard(scores, 'net', limit),
});
