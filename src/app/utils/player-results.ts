export type PlayerResultsPlayer = {
  id: number;
  firstName: string;
  lastName: string;
};

export type PlayerResultsRound = {
  playerId: number;
  eventId: number;
  gross: number;
  net: number;
  pointsEarned: number | null;
  matchPoints: number | null;
  eagles: number;
  birdies: number;
  pars: number;
  player: PlayerResultsPlayer;
};

export type PlayerResult = {
  rank: number;
  playerId: number;
  name: string;
  eventsPlayed: number;
  totalGross: number;
  totalNet: number;
  totalPoints: number;
  eagles: number;
  birdies: number;
  pars: number;
};

type PlayerResultAccumulator = Omit<PlayerResult, 'rank' | 'eventsPlayed'> & {
  eventIds: Set<number>;
};

const playerName = (player: PlayerResultsPlayer) =>
  `${player.firstName} ${player.lastName}`.trim();

export const calculatePlayerResults = (
  leaguePlayers: PlayerResultsPlayer[],
  rounds: PlayerResultsRound[],
): PlayerResult[] => {
  const resultsByPlayerId = new Map<number, PlayerResultAccumulator>();

  const addPlayer = (player: PlayerResultsPlayer) => {
    if (resultsByPlayerId.has(Number(player.id))) return;
    resultsByPlayerId.set(Number(player.id), {
      playerId: Number(player.id),
      name: playerName(player),
      eventIds: new Set<number>(),
      totalGross: 0,
      totalNet: 0,
      totalPoints: 0,
      eagles: 0,
      birdies: 0,
      pars: 0,
    });
  };

  leaguePlayers.forEach(addPlayer);

  for (const round of rounds) {
    addPlayer(round.player);
    const result = resultsByPlayerId.get(Number(round.playerId));
    if (!result) continue;

    result.eventIds.add(Number(round.eventId));
    result.totalGross += Number(round.gross || 0);
    result.totalNet += Number(round.net || 0);
    result.totalPoints += Number(round.pointsEarned || 0) + Number(round.matchPoints || 0);
    result.eagles += Number(round.eagles || 0);
    result.birdies += Number(round.birdies || 0);
    result.pars += Number(round.pars || 0);
  }

  const sortedResults = [...resultsByPlayerId.values()].sort(
    (left, right) =>
      right.totalPoints - left.totalPoints ||
      right.eventIds.size - left.eventIds.size ||
      left.name.localeCompare(right.name),
  );

  let previousPoints: number | null = null;
  let previousRank = 0;
  return sortedResults.map((result, index) => {
    const totalPoints = Math.round(result.totalPoints * 10) / 10;
    const rank = previousPoints != null && totalPoints === previousPoints ? previousRank : index + 1;
    previousPoints = totalPoints;
    previousRank = rank;

    return {
      rank,
      playerId: result.playerId,
      name: result.name,
      eventsPlayed: result.eventIds.size,
      totalGross: result.totalGross,
      totalNet: result.totalNet,
      totalPoints,
      eagles: result.eagles,
      birdies: result.birdies,
      pars: result.pars,
    };
  });
};
