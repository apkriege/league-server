import { parsePlacementPoints, roundScoringPoints } from './numeric';
import { calculateStablefordPoints } from './stableford';
import { normalizeScoringConfiguration } from './config';
import { addTeamEventPoints, getFlightTeamIds } from './team-points';
import { buildAbsolutePops } from './playing-handicap';
import type {
  ScoringEvent,
  ScoringFlight,
  ScoringHole,
  ScoringRound,
  TeamEventPointsAccumulator,
} from './types';

export const assignBestBallPoints = ({
  event,
  holes,
  flights,
  roundsByPlayerId,
  teamPoints,
}: {
  event: ScoringEvent;
  holes: ScoringHole[];
  flights: ScoringFlight[];
  roundsByPlayerId: Map<number, ScoringRound>;
  teamPoints: TeamEventPointsAccumulator;
}) => {
  for (const round of roundsByPlayerId.values()) {
    round.pointsEarned = 0;
    round.matchPoints = 0;
  }

  const placementPoints = parsePlacementPoints(event.strokePoints);
  const configuration = normalizeScoringConfiguration(event.scoringConfig, 'best-ball');
  const popsByPlayerId = buildAbsolutePops(
    [...roundsByPlayerId.values()],
    holes,
    configuration.handicapAllowance,
  );
  const totals: Array<{ teamId: number; net: number; stableford: number }> = [];

  for (const flight of flights) {
    const roundsForTeam = (teamId: number) =>
      (flight.players || [])
        .filter((player) => Number(player.teamId ?? player.player?.teamId) === teamId)
        .map((player) => roundsByPlayerId.get(Number(player.playerId)))
        .filter((round): round is ScoringRound => Boolean(round));

    const bestNetForTeam = (rounds: ScoringRound[], holeNumber: number) => {
      let best: { net: number; par: number } | null = null;
      for (const round of rounds) {
        const score = round.scores.find((entry) => entry.hole === holeNumber);
        if (!score?.gross) continue;
        const pops = popsByPlayerId.get(round.playerId)?.get(holeNumber) || 0;
        const candidate = { net: score.gross - pops, par: score.par };
        if (!best || candidate.net < best.net) best = candidate;
      }
      return best;
    };

    for (const teamId of getFlightTeamIds(flight)) {
      const rounds = roundsForTeam(teamId);
      if (rounds.length === 0) continue;
      let net = 0;
      let stableford = 0;
      for (const hole of holes) {
        const best = bestNetForTeam(rounds, hole.num);
        if (!best) continue;
        net += best.net;
        stableford += calculateStablefordPoints(
          best.net,
          best.par,
          configuration.stablefordPointScale,
        );
      }
      totals.push({ teamId, net, stableford });
    }
  }

  if (placementPoints.length === 0) {
    for (const total of totals) {
      addTeamEventPoints(
        teamPoints,
        event.leagueId,
        event.id,
        total.teamId,
        roundScoringPoints(total.stableford),
      );
    }
    return;
  }

  const ranked = [...totals].sort((left, right) => left.net - right.net);
  let cursor = 0;
  while (cursor < ranked.length) {
    let end = cursor;
    while (end + 1 < ranked.length && ranked[end + 1].net === ranked[cursor].net) end += 1;
    const points = roundScoringPoints(
      placementPoints.slice(cursor, end + 1).reduce((sum, value) => sum + value, 0) /
        (end - cursor + 1),
    );
    for (let index = cursor; index <= end; index += 1) {
      addTeamEventPoints(teamPoints, event.leagueId, event.id, ranked[index].teamId, points);
    }
    cursor = end + 1;
  }
};
