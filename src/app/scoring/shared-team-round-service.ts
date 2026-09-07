import type { Prisma } from '@prisma/client';
import { dateOnlyInTimeZone } from '../utils/time-zone';
import { modelEventTeeForRound } from '../utils/event-route';
import { normalizeScoringConfiguration } from './config';
import { getScoringMode, type ScoringMode } from './modes';
import { parsePlacementPoints, roundScoringPoints } from './numeric';
import { modelSharedTeamRound, type SharedTeamRoundMode } from './shared-team-round';
import {
  applyHandicapAllowance,
  calculateAlternateShotHandicap,
  calculateScrambleHandicap,
} from './team-handicap';

type PrismaTx = Prisma.TransactionClient;

type TeamScoreSubmission = {
  teamId: number;
  scores: unknown;
};

type PersistedTeamPoints = {
  teamId: number;
  points: number;
};

const normalizeTeamSubmissions = (raw: unknown): TeamScoreSubmission[] => {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('Team scores are required for this scoring format.');
  }
  const submissions = raw.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error('Each team score submission must be an object.');
    }
    const source = entry as Record<string, unknown>;
    const teamId = Number(source.teamId);
    if (!Number.isInteger(teamId) || teamId <= 0) {
      throw new Error('Team ids must be valid.');
    }
    return { teamId, scores: source.scores };
  });
  if (new Set(submissions.map((entry) => entry.teamId)).size !== submissions.length) {
    throw new Error('Team ids must be unique.');
  }
  return submissions;
};

export const calculateSharedTeamPoints = (
  rounds: Array<{ teamId: number; net: number; stablefordPoints: number }>,
  strokePointsRaw: unknown,
): PersistedTeamPoints[] => {
  const placementPoints = parsePlacementPoints(strokePointsRaw);
  if (placementPoints.length === 0) {
    return rounds.map((round) => ({
      teamId: round.teamId,
      points: roundScoringPoints(round.stablefordPoints),
    }));
  }

  const ranked = [...rounds].sort((left, right) => left.net - right.net);
  const assigned = new Map<number, number>();
  let cursor = 0;
  while (cursor < ranked.length) {
    let end = cursor;
    while (end + 1 < ranked.length && ranked[end + 1].net === ranked[cursor].net) end += 1;
    const total = placementPoints
      .slice(cursor, end + 1)
      .reduce((sum, points) => sum + points, 0);
    const points = roundScoringPoints(total / (end - cursor + 1));
    for (let index = cursor; index <= end; index += 1) {
      assigned.set(ranked[index].teamId, points);
    }
    cursor = end + 1;
  }
  return rounds.map((round) => ({ teamId: round.teamId, points: assigned.get(round.teamId) || 0 }));
};

const assertSharedMode = (raw: unknown): SharedTeamRoundMode => {
  const mode = getScoringMode(raw).id;
  if (mode !== 'scramble' && mode !== 'alternate-shot') {
    throw new Error('Shared team scores are only valid for scramble or alternate shot.');
  }
  return mode;
};

export const persistSharedTeamRounds = async ({
  db,
  eventId,
  flightId,
  rawTeamScores,
  isEdit,
}: {
  db: PrismaTx;
  eventId: number;
  flightId: number;
  rawTeamScores: unknown;
  isEdit: boolean;
}): Promise<PersistedTeamPoints[]> => {
  const submissions = normalizeTeamSubmissions(rawTeamScores);
  const event = await db.event.findUnique({
    where: { id: eventId },
    include: {
      course: true,
      tee: true,
      routeSegments: {
        orderBy: { position: 'asc' },
        include: { course: true, tee: true },
      },
      flights: {
        where: { id: flightId, deletedAt: null },
        include: {
          teams: { where: { deletedAt: null } },
          players: {
            where: { deletedAt: null },
            include: { player: true },
          },
        },
      },
    },
  });
  if (!event || event.flights.length !== 1) throw new Error('Flight does not belong to this event.');

  const mode = assertSharedMode(event.scoringMode as ScoringMode);
  const flight = event.flights[0];
  if (!isEdit && String(flight.status).toLowerCase() === 'completed') {
    throw new Error('Flight scores have already been entered.');
  }
  const assignedTeamIds = new Set(flight.teams.map((assignment) => assignment.teamId));
  if (
    submissions.length !== assignedTeamIds.size ||
    submissions.some((submission) => !assignedTeamIds.has(submission.teamId))
  ) {
    throw new Error('Scores must include exactly the teams assigned to this flight.');
  }

  const configuration = normalizeScoringConfiguration(event.scoringConfig, mode);
  const preparedRounds = submissions.map((submission) => {
    const assignments = flight.players.filter((entry) => entry.teamId === submission.teamId);
    const expectedPlayers = mode === 'alternate-shot' ? 2 : null;
    if (
      (expectedPlayers != null && assignments.length !== expectedPlayers) ||
      (mode === 'scramble' && (assignments.length < 2 || assignments.length > 4))
    ) {
      throw new Error(
        mode === 'alternate-shot'
          ? 'Alternate shot requires exactly two assigned players per team.'
          : 'Scramble requires two, three, or four assigned players per team.',
      );
    }
    const scorecardGender = configuration.sharedTeamScorecard || 'male';
    const selectedTee = modelEventTeeForRound(event, scorecardGender);

    const playerHandicaps = assignments.map((assignment) => {
      const playerHandicap = Number(assignment.player.handicap);
      if (!Number.isFinite(playerHandicap)) {
        throw new Error(`Player ${assignment.playerId} has an invalid handicap.`);
      }
      return {
        playerId: assignment.playerId,
        playerHandicap,
      };
    });
    const baseTeamHandicap =
      mode === 'scramble'
        ? calculateScrambleHandicap(playerHandicaps.map((entry) => entry.playerHandicap))
        : calculateAlternateShotHandicap(
            playerHandicaps.map((entry) => entry.playerHandicap),
          );
    return {
      submission,
      teamId: submission.teamId,
      playerHandicaps,
      scorecardGender,
      selectedTee,
      baseTeamHandicap,
    };
  });
  const modeledRounds = preparedRounds.map((prepared) => {
    const playingHandicap = applyHandicapAllowance(
      prepared.baseTeamHandicap,
      configuration.handicapAllowance,
    );
    const round = modelSharedTeamRound({
      mode,
      holes: prepared.selectedTee.holes,
      rawScores: prepared.submission.scores,
      playingHandicap,
      configuration,
    });
    return {
      teamId: prepared.teamId,
      playingHandicap,
      playerHandicaps: prepared.playerHandicaps,
      scorecardGender: prepared.scorecardGender,
      baseTeamHandicap: prepared.baseTeamHandicap,
      round,
    };
  });

  for (const modeled of modeledRounds) {
    const existing = await db.team_round.findUnique({
      where: { eventId_teamId: { eventId, teamId: modeled.teamId } },
    });
    if (isEdit && !existing) throw new Error(`Team round not found for team ${modeled.teamId}.`);
    if (!isEdit && existing && existing.deletedAt == null) {
      throw new Error(`Team round already exists for team ${modeled.teamId}.`);
    }

    const data = {
      flightId,
      courseId: event.courseId,
      teeId: event.teeId,
      status: 'completed',
      holesPlayed: modeled.round.holesPlayed,
      gross: modeled.round.gross,
      net: modeled.round.net,
      adjusted: modeled.round.adjusted,
      handicapAllowance: configuration.handicapAllowance,
      handicapSnapshot: {
        formula: mode,
        scorecardGender: modeled.scorecardGender,
        players: modeled.playerHandicaps,
        baseTeamHandicap: modeled.baseTeamHandicap,
        playingTeamHandicap: modeled.playingHandicap,
      },
      pointsEarned: 0,
      matchPoints: 0,
      date: dateOnlyInTimeZone(event.startsAt, event.timeZone),
      deletedAt: null,
    };
    const teamRound = existing
      ? await db.team_round.update({ where: { id: existing.id }, data })
      : await db.team_round.create({
          data: { ...data, eventId, teamId: modeled.teamId },
        });
    await db.team_score.deleteMany({ where: { teamRoundId: teamRound.id } });
    await db.team_score.createMany({
      data: modeled.round.scores.map((score) => ({
        teamRoundId: teamRound.id,
        ...score,
      })),
    });
  }

  return recalculateSharedTeamEventPoints({ db, eventId });
};

export const recalculateSharedTeamEventPoints = async ({
  db,
  eventId,
}: {
  db: PrismaTx;
  eventId: number;
}): Promise<PersistedTeamPoints[]> => {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { pointsEnabled: true, strokePoints: true },
  });
  if (!event) throw new Error('Event not found.');

  const rounds = await db.team_round.findMany({
    where: { eventId, status: 'completed', deletedAt: null },
    include: { scores: true },
  });
  const teamPoints = event.pointsEnabled
    ? calculateSharedTeamPoints(
        rounds.map((round) => ({
          teamId: round.teamId,
          net: round.net,
          stablefordPoints: round.scores.reduce((sum, score) => sum + score.points, 0),
        })),
        event.strokePoints,
      )
    : rounds.map((round) => ({ teamId: round.teamId, points: 0 }));

  for (const row of teamPoints) {
    await db.team_round.update({
      where: { eventId_teamId: { eventId, teamId: row.teamId } },
      data: { pointsEarned: row.points },
    });
  }
  return teamPoints;
};
