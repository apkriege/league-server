import type { Prisma } from '@prisma/client';

export type ScoreSnapshot = {
  flightId: number;
  players: Array<{ playerId: number; participantId: string; name: string; scores: Record<string, number> }>;
  teamScores: Array<{ teamId: number; participantId: string; name: string; scores: Record<string, number> }>;
};

export async function readFlightScoreSnapshot(tx: Prisma.TransactionClient, eventId: number, flightId: number): Promise<ScoreSnapshot> {
  const assignments = await tx.flight_player.findMany({
    where: { flightId, deletedAt: null }, select: { playerId: true },
  });
  const [rounds, teamRounds] = await Promise.all([
    tx.round.findMany({
      where: { eventId, playerId: { in: assignments.map((entry) => entry.playerId) }, deletedAt: null },
      select: { playerId: true, player: { select: { firstName: true, lastName: true } }, scores: { select: { hole: true, gross: true }, orderBy: { hole: 'asc' } } },
      orderBy: { playerId: 'asc' },
    }),
    tx.team_round.findMany({
      where: { eventId, flightId, deletedAt: null },
      select: { teamId: true, team: { select: { name: true } }, scores: { select: { hole: true, gross: true }, orderBy: { hole: 'asc' } } },
      orderBy: { teamId: 'asc' },
    }),
  ]);
  return {
    flightId,
    players: rounds.map((round) => ({ playerId: round.playerId, participantId: `player:${round.playerId}`, name: `${round.player.firstName} ${round.player.lastName}`, scores: Object.fromEntries(round.scores.map((score) => [score.hole, score.gross])) })),
    teamScores: teamRounds.map((round) => ({ teamId: round.teamId, participantId: `team:${round.teamId}`, name: round.team.name, scores: Object.fromEntries(round.scores.map((score) => [score.hole, score.gross])) })),
  };
}

export async function recordScoreRevision(tx: Prisma.TransactionClient, input: {
  eventId: number; leagueId: number; userId: number | null; before: ScoreSnapshot;
}) {
  const after = await readFlightScoreSnapshot(tx, input.eventId, input.before.flightId);
  if (JSON.stringify(input.before) === JSON.stringify(after)) return;
  await tx.audit_log.create({
    data: {
      userId: input.userId, leagueId: input.leagueId,
      entity: 'score_revision', entityId: input.eventId, action: 'save',
      summary: `Saved scores for flight ${after.flightId}.`,
      metadata: { version: 1, before: input.before, after },
    },
  });
}
