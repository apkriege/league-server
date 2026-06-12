"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllocatedGolfersForAdmin = exports.mergeBillingMetadata = exports.getBillingState = exports.getIncludedGolfers = exports.getBillingMetadata = exports.BILLING_CURRENCY = exports.BILLING_PRICE_PER_GOLFER_CENTS = exports.BILLING_MIN_GOLFERS = void 0;
const prisma_1 = require("../../prisma");
exports.BILLING_MIN_GOLFERS = Math.max(1, Number(process.env.BILLING_MIN_GOLFERS || 8));
exports.BILLING_PRICE_PER_GOLFER_CENTS = Math.max(0, Number(process.env.BILLING_PRICE_PER_GOLFER_CENTS || 1000));
exports.BILLING_CURRENCY = String(process.env.BILLING_CURRENCY || 'usd').toLowerCase();
const toObject = (value) => (value && typeof value === 'object' ? value : {});
const getBillingMetadata = (metadata) => {
    const root = toObject(metadata);
    return toObject(root.billing);
};
exports.getBillingMetadata = getBillingMetadata;
const getIncludedGolfers = (metadata) => {
    const billing = (0, exports.getBillingMetadata)(metadata);
    return Math.max(0, Number(billing.includedGolfers || 0));
};
exports.getIncludedGolfers = getIncludedGolfers;
const getBillingState = (metadata, allocatedGolfers = 0, overrides = {}) => {
    const includedGolfers = overrides.includedGolfers ?? (0, exports.getIncludedGolfers)(metadata);
    const resolvedAllocatedGolfers = overrides.allocatedGolfers ?? allocatedGolfers ?? 0;
    const safeAllocatedGolfers = Math.max(0, Number(resolvedAllocatedGolfers));
    return {
        minimumGolfers: exports.BILLING_MIN_GOLFERS,
        pricePerGolferCents: exports.BILLING_PRICE_PER_GOLFER_CENTS,
        currency: exports.BILLING_CURRENCY,
        includedGolfers,
        allocatedGolfers: safeAllocatedGolfers,
        availableGolfers: Math.max(0, includedGolfers - safeAllocatedGolfers),
        hasCompletedRegistration: includedGolfers >= exports.BILLING_MIN_GOLFERS,
    };
};
exports.getBillingState = getBillingState;
const mergeBillingMetadata = (metadata, billingPatch) => {
    const root = toObject(metadata);
    const billing = (0, exports.getBillingMetadata)(metadata);
    return {
        ...root,
        billing: {
            ...billing,
            ...billingPatch,
        },
    };
};
exports.mergeBillingMetadata = mergeBillingMetadata;
const getAllocatedGolfersForAdmin = async (adminId, excludeLeagueId) => {
    const aggregate = await prisma_1.prisma.league.aggregate({
        where: {
            adminId,
            deletedAt: null,
            ...(excludeLeagueId ? { id: { not: excludeLeagueId } } : {}),
        },
        _sum: {
            numPlayers: true,
        },
    });
    return Math.max(0, Number(aggregate._sum.numPlayers || 0));
};
exports.getAllocatedGolfersForAdmin = getAllocatedGolfersForAdmin;
