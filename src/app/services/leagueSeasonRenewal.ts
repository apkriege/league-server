import type { Prisma } from '@prisma/client';
import { prisma } from '../../prisma';

export class LeagueSeasonRenewalError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
    readonly renewedLeague?: { id: number; name: string; startDate: Date; endDate: Date },
  ) {
    super(message);
    this.name = 'LeagueSeasonRenewalError';
  }
}

export const shiftSeasonDate = (date: Date) => {
  const shifted = new Date(date);
  const nextYear = shifted.getUTCFullYear() + 1;
  const month = shifted.getUTCMonth();
  const day = shifted.getUTCDate();
  shifted.setUTCFullYear(nextYear, month, 1);
  const lastDayOfTargetMonth = new Date(Date.UTC(nextYear, month + 1, 0)).getUTCDate();
  shifted.setUTCDate(Math.min(day, lastDayOfTargetMonth));
  return shifted;
};

export const getRenewedLeagueName = (name: string, sourceYear: number, nextYear: number) => {
  const sourceYearPattern = new RegExp(`\\b${sourceYear}\\b`);
  return sourceYearPattern.test(name)
    ? name.replace(sourceYearPattern, String(nextYear))
    : `${name} ${nextYear}`;
};

const renewalTemplateInclude = {
  entitlement: { select: { requiredGolfers: true } },
  players: {
    where: { deletedAt: null },
    orderBy: { id: 'asc' },
  },
  teams: {
    where: { deletedAt: null },
    include: {
      players: {
        where: { deletedAt: null },
        select: { id: true },
      },
    },
    orderBy: { id: 'asc' },
  },
  scoringPeriods: {
    orderBy: { position: 'asc' },
  },
  renewedLeague: {
    select: { id: true, name: true, startDate: true, endDate: true },
  },
} satisfies Prisma.leagueInclude;

export const prepareLeagueRenewalTemplate = async (
  adminId: number,
  leagueId: number,
  db: typeof prisma | Prisma.TransactionClient = prisma,
) => {
  if (!Number.isInteger(leagueId) || leagueId <= 0) {
    throw new LeagueSeasonRenewalError('Invalid league ID', 400);
  }

  const source = await db.league.findFirst({
    where: { id: leagueId, adminId, deletedAt: null },
    include: renewalTemplateInclude,
  });
  if (!source) throw new LeagueSeasonRenewalError('League not found', 404);
  if (source.type !== 'season') {
    throw new LeagueSeasonRenewalError('Only season leagues can be renewed.', 409);
  }
  if (source.renewedLeague) {
    throw new LeagueSeasonRenewalError(
      'This league already has a next season.',
      409,
      source.renewedLeague,
    );
  }

  const startDate = shiftSeasonDate(source.startDate);
  const endDate = shiftSeasonDate(source.endDate);
  const sourceYear = source.startDate.getUTCFullYear();
  const nextYear = startDate.getUTCFullYear();

  return {
    sourceLeague: {
      id: source.id,
      name: source.name,
      startDate: source.startDate,
      endDate: source.endDate,
    },
    league: {
      renewedFromLeagueId: source.id,
      name: getRenewedLeagueName(source.name, sourceYear, nextYear),
      description: source.description || '',
      numPlayers: source.entitlement.requiredGolfers,
      type: source.type,
      holeFormat: source.holeFormat,
      format: source.format,
      contactFirstName: source.contactFirstName,
      contactLastName: source.contactLastName,
      contactEmail: source.contactEmail,
      contactPhone: source.contactPhone || '',
      startDate,
      endDate,
      players: source.players.map((player) => ({
        id: player.id,
        sourcePlayerId: player.id,
        firstName: player.firstName,
        lastName: player.lastName,
        email: player.email || '',
        phone: player.phone || '',
        gender: player.gender,
        type: player.type,
        handicap: player.handicap,
      })),
      teams: source.teams.map((team) => ({
        id: team.id,
        name: team.name,
        players: team.players.map((player) => player.id),
      })),
      scoringPeriods: source.scoringPeriods.map((period) => ({
        name: period.name,
        position: period.position,
        startDate: shiftSeasonDate(period.startDate),
        endDate: shiftSeasonDate(period.endDate),
      })),
    },
  };
};
