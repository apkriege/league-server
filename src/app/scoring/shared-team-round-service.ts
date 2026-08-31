import type { Prisma } from '@prisma/client';
import { dateOnlyInTimeZone } from '../utils/time-zone';
import { getHandicapHoleBasis } from '../utils/league-hole-format';
import {
  calculateCourseHandicap,
  modelTeeForRound,
} from '../utils/tee-rating';
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

const assignTeamPoints = (
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
      league: { select: { holeFormat: true } },
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
  const handicapHoleBasis = getHandicapHoleBasis(event.league.holeFormat);
  const competitionGender = flight.players.every(
    (entry) => String(entry.player.gender || '').toLowerCase() === 'female',
  )
    ? 'female'
    : 'male';
  const selectedTee = modelTeeForRound(event.tee, event.holes, event.startSide, {
    courseHoles: event.course.numHoles,
    gender: competitionGender,
  });

  const modeledRounds = submissions.map((submission) => {
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

    const playerHandicaps = assignments.map((assignment) => {
      const playerTee = modelTeeForRound(event.tee, event.holes, event.startSide, {
        courseHoles: event.course.numHoles,
        gender: assignment.player.gender,
      });
      return {
        playerId: assignment.playerId,
        courseHandicap: calculateCourseHandicap(
          assignment.player.handicap,
          playerTee,
          handicapHoleBasis,
        ),
      };
    });
    const baseTeamHandicap =
      mode === 'scramble'
        ? calculateScrambleHandicap(playerHandicaps.map((entry) => entry.courseHandicap))
        : calculateAlternateShotHandicap(playerHandicaps.map((entry) => entry.courseHandicap));
    const courseHandicap = applyHandicapAllowance(
      baseTeamHandicap,
      configuration.handicapAllowance,
    );
    const round = modelSharedTeamRound({
      mode,
      holes: selectedTee.holes,
      rawScores: submission.scores,
      courseHandicap,
      configuration,
    });
    return {
      teamId: submission.teamId,
      courseHandicap,
      playerHandicaps,
      round,
    };
  });

  const teamPoints = event.pointsEnabled
    ? assignTeamPoints(
        modeledRounds.map(({ teamId, round }) => ({
          teamId,
          net: round.net,
          stablefordPoints: round.stablefordPoints,
        })),
        event.strokePoints,
      )
    : modeledRounds.map(({ teamId }) => ({ teamId, points: 0 }));
  const pointsByTeamId = new Map(teamPoints.map((entry) => [entry.teamId, entry.points]));

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
      courseHandicap: modeled.courseHandicap,
      handicapAllowance: configuration.handicapAllowance,
      handicapSnapshot: {
        formula: mode,
        players: modeled.playerHandicaps,
        baseTeamHandicap:
          mode === 'scramble'
            ? calculateScrambleHandicap(modeled.playerHandicaps.map((entry) => entry.courseHandicap))
            : calculateAlternateShotHandicap(
                modeled.playerHandicaps.map((entry) => entry.courseHandicap),
              ),
      },
      pointsEarned: pointsByTeamId.get(modeled.teamId) || 0,
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

  return teamPoints;
};
