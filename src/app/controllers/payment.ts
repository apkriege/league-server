import { Request, Response } from 'express';
import Stripe from 'stripe';
import { prisma } from '../../prisma';
import { getPrimaryClientOrigin, isTrustedClientOrigin } from '../utils/origins';
import {
  BILLING_CURRENCY,
  BILLING_MIN_GOLFERS,
  BILLING_PRICE_PER_GOLFER_CENTS,
  getBillingMetadata,
  getAllocatedGolfersForAdmin,
  getBillingState,
  mergeBillingMetadata,
} from '../utils/billing';
import { lockAdminBilling, lockLeagueCapacity } from '../services/billingLock';
import { redeemPaymentBypassCode } from '../services/paymentBypassCode';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

const defaultClientOrigin = getPrimaryClientOrigin() || 'http://localhost:5173';

const DEFAULT_SUCCESS_URL =
  process.env.STRIPE_CHECKOUT_SUCCESS_URL ||
  `${defaultClientOrigin}/leagues?checkout=registration_success`;
const DEFAULT_CANCEL_URL =
  process.env.STRIPE_CHECKOUT_CANCEL_URL ||
  `${defaultClientOrigin}/?checkout=registration_cancel#register`;
const DEFAULT_PRICE_ID = process.env.STRIPE_PRICE_ID || '';
const PRODUCT_TAX_CODE = process.env.STRIPE_PRODUCT_TAX_CODE || 'txcd_10103000';

const CHECKOUT_PURPOSES = [
  'registration',
  'seat_upgrade',
  'league_capacity',
] as const;
type CheckoutPurpose = (typeof CHECKOUT_PURPOSES)[number];
export type CheckoutConfirmationStatus = 'succeeded' | 'processing' | 'failed';

const isCheckoutPurpose = (value: string): value is CheckoutPurpose =>
  CHECKOUT_PURPOSES.some((purpose) => purpose === value);

const getProductName = (purpose: CheckoutPurpose, quantity: number) => {
  if (purpose === 'registration') {
    return `League Admin Registration (${quantity} golfers included)`;
  }

  if (purpose === 'league_capacity') {
    return `Additional league golfer capacity (${quantity})`;
  }

  return `Additional golfer seats (${quantity})`;
};

const getCheckoutRedirectUrl = (value: unknown, fallback: string) => {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  return isTrustedClientOrigin(value.trim()) ? value.trim() : fallback;
};

export const withCheckoutSessionId = (redirectUrl: string) => {
  if (redirectUrl.includes('{CHECKOUT_SESSION_ID}')) return redirectUrl;

  const hashIndex = redirectUrl.indexOf('#');
  const url = hashIndex >= 0 ? redirectUrl.slice(0, hashIndex) : redirectUrl;
  const hash = hashIndex >= 0 ? redirectUrl.slice(hashIndex) : '';
  const separator = url.includes('?') ? '&' : '?';

  return `${url}${separator}session_id={CHECKOUT_SESSION_ID}${hash}`;
};

export const getCheckoutConfirmationStatus = (
  session: Stripe.Checkout.Session,
): CheckoutConfirmationStatus => {
  if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') {
    return 'succeeded';
  }

  const paymentIntentStatus =
    session.payment_intent && typeof session.payment_intent !== 'string'
      ? session.payment_intent.status
      : null;

  if (
    session.status === 'expired' ||
    paymentIntentStatus === 'canceled' ||
    paymentIntentStatus === 'requires_payment_method'
  ) {
    return 'failed';
  }

  return 'processing';
};

const isMissingStripeResource = (error: unknown) => {
  const stripeError = error as { code?: unknown; statusCode?: unknown };
  return stripeError?.code === 'resource_missing' || stripeError?.statusCode === 404;
};

const createStripeCustomer = (user: {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
}) =>
  stripe.customers.create({
    email: user.email,
    name: `${user.firstName} ${user.lastName}`,
    metadata: { userId: String(user.id) },
  });

const resolveStripeCustomerId = async (
  customerId: string | undefined,
  user: { id: number; email: string; firstName: string; lastName: string },
) => {
  if (customerId) {
    try {
      const customer = await stripe.customers.retrieve(customerId);
      if (!customer.deleted) return customer.id;
    } catch (error) {
      if (!isMissingStripeResource(error)) throw error;
    }
  }

  const customer = await createStripeCustomer(user);
  return customer.id;
};

export const applyCompletedCheckoutSession = async (session: Stripe.Checkout.Session) => {
  const userIdFromReference = Number(session.client_reference_id);
  if (!userIdFromReference) return null;

  if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
    return null;
  }

  const completedQuantity = Math.max(0, Number(session.metadata?.quantity || 0));
  const requestedTargetGolfers = Math.max(0, Number(session.metadata?.targetGolfers || 0));
  const leagueId = Math.max(0, Number(session.metadata?.leagueId || 0));
  const completedPurpose = String(session.metadata?.purpose || 'seat_upgrade');
  if (!Number.isInteger(completedQuantity) || completedQuantity <= 0) return null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          await lockAdminBilling(tx, userIdFromReference);
          if (completedPurpose === 'league_capacity' && leagueId > 0) {
            await lockLeagueCapacity(tx, leagueId);
          }
          const processed = await tx.stripe_checkout_completion.findUnique({
            where: { sessionId: session.id },
          });
          if (processed) {
            return tx.user.findFirst({ where: { id: userIdFromReference, deletedAt: null } });
          }

          const user = await tx.user.findFirst({
            where: { id: userIdFromReference, deletedAt: null },
          });
          if (!user) return null;

          const currentMetadata =
            user.metadata && typeof user.metadata === 'object' ? user.metadata : {};
          const currentStripeMetadata =
            (currentMetadata as any)?.stripe && typeof (currentMetadata as any).stripe === 'object'
              ? (currentMetadata as any).stripe
              : {};
          const currentBillingMetadata = getBillingMetadata(currentMetadata);
          const currentIncludedGolfers = Math.max(
            0,
            Number(currentBillingMetadata.includedGolfers || 0),
          );
          const nextIncludedGolfers =
            completedPurpose === 'league_capacity'
              ? currentIncludedGolfers + completedQuantity
              : Math.max(
                  currentIncludedGolfers + completedQuantity,
                  requestedTargetGolfers,
                  currentIncludedGolfers,
                );

          if (completedPurpose === 'league_capacity' && leagueId > 0) {
            const league = await tx.league.findFirst({
              where: { id: leagueId, adminId: user.id, deletedAt: null },
              select: { id: true, numPlayers: true },
            });
            if (league) {
              await tx.league.update({
                where: { id: league.id },
                data: { numPlayers: Math.max(league.numPlayers, requestedTargetGolfers) },
              });
            }
          }

          const updatedUser = await tx.user.update({
            where: { id: user.id },
            data: {
              metadata: mergeBillingMetadata(
                {
                  ...(currentMetadata as object),
                  stripe: {
                    ...currentStripeMetadata,
                    customerId:
                      typeof session.customer === 'string'
                        ? session.customer
                        : currentStripeMetadata.customerId,
                    lastCheckoutSessionId: session.id,
                    lastCheckoutStatus: 'completed',
                    lastCheckoutPurpose: completedPurpose,
                    lastPaymentIntentId:
                      typeof session.payment_intent === 'string' ? session.payment_intent : null,
                    lastCompletedAt: new Date().toISOString(),
                  },
                },
                {
                  includedGolfers: nextIncludedGolfers,
                  minimumGolfers: BILLING_MIN_GOLFERS,
                  pricePerGolferCents: BILLING_PRICE_PER_GOLFER_CENTS,
                  currency: BILLING_CURRENCY,
                  lastCompletedCheckoutPurpose: completedPurpose,
                  lastCompletedSeatQuantity: completedQuantity,
                  lastCompletedTargetGolfers: requestedTargetGolfers,
                  registrationCompletedAt:
                    completedPurpose === 'registration'
                      ? new Date().toISOString()
                      : currentBillingMetadata.registrationCompletedAt || null,
                },
              ),
            },
          });

          await tx.stripe_checkout_completion.create({
            data: {
              sessionId: session.id,
              paymentIntentId:
                typeof session.payment_intent === 'string' ? session.payment_intent : null,
              userId: user.id,
              leagueId: leagueId > 0 ? leagueId : null,
              purpose: completedPurpose,
              quantity: completedQuantity,
              targetGolfers: requestedTargetGolfers,
            },
          });

          return updatedUser;
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return prisma.user.findFirst({ where: { id: userIdFromReference, deletedAt: null } });
      }
      if (error?.code !== 'P2034' || attempt === 2) throw error;
    }
  }

  return null;
};

export const applyRefundedCharge = async (charge: Stripe.Charge) => {
  const paymentIntentId =
    typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntentId || Number(charge.amount_refunded || 0) <= 0) return null;

  return prisma.$transaction(
    async (tx) => {
      const completion = await tx.stripe_checkout_completion.findUnique({
        where: { paymentIntentId },
      });
      if (!completion) return null;

      await lockAdminBilling(tx, completion.userId);
      if (completion.purpose === 'league_capacity' && completion.leagueId) {
        await lockLeagueCapacity(tx, completion.leagueId);
      }

      const totalRefundedQuantity = charge.refunded
        ? completion.quantity
        : Math.min(
            completion.quantity,
            Math.floor(
              Number(charge.amount_refunded || 0) /
                Math.max(1, BILLING_PRICE_PER_GOLFER_CENTS),
            ),
          );
      const quantityToRevoke = Math.max(
        0,
        totalRefundedQuantity - Number(completion.refundedQuantity || 0),
      );
      if (quantityToRevoke === 0) return completion;

      const user = await tx.user.findFirst({
        where: { id: completion.userId, deletedAt: null },
        select: { metadata: true },
      });
      if (!user) return null;

      const billing = getBillingMetadata(user.metadata);
      const includedGolfers = Math.max(0, Number(billing.includedGolfers || 0));
      await tx.user.update({
        where: { id: completion.userId },
        data: {
          metadata: mergeBillingMetadata(user.metadata, {
            includedGolfers: Math.max(0, includedGolfers - quantityToRevoke),
            lastRefundedAt: new Date().toISOString(),
            lastRefundedSeatQuantity: quantityToRevoke,
          }),
        },
      });

      if (completion.purpose === 'league_capacity' && completion.leagueId) {
        const league = await tx.league.findFirst({
          where: { id: completion.leagueId, adminId: completion.userId, deletedAt: null },
          select: { id: true, numPlayers: true },
        });
        if (league) {
          const activeRegularPlayers = await tx.player.count({
            where: { leagueId: league.id, type: 'player', deletedAt: null },
          });
          await tx.league.update({
            where: { id: league.id },
            data: {
              numPlayers: Math.max(
                BILLING_MIN_GOLFERS,
                activeRegularPlayers,
                league.numPlayers - quantityToRevoke,
              ),
            },
          });
        }
      }

      return tx.stripe_checkout_completion.update({
        where: { id: completion.id },
        data: {
          refundedQuantity: totalRefundedQuantity,
          refundedAt: new Date(),
        },
      });
    },
    { isolationLevel: 'Serializable' },
  );
};

export const applyLostDispute = async (dispute: Stripe.Dispute) => {
  if (dispute.status !== 'lost') return null;
  const paymentIntentId =
    typeof dispute.payment_intent === 'string'
      ? dispute.payment_intent
      : dispute.payment_intent?.id;
  if (!paymentIntentId) return null;

  return applyRefundedCharge({
    payment_intent: paymentIntentId,
    amount_refunded: dispute.amount,
    refunded: false,
  } as Stripe.Charge);
};

class PaymentController {
  static async createCheckoutSession(req: Request, res: Response) {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const requestedPurpose = String(req.body?.purpose || 'seat_upgrade');
      const leagueId = Number(req.body?.leagueId || 0);
      const requestedGolfers = Math.max(
        0,
        Number(req.body?.requestedGolfers ?? req.body?.quantity ?? BILLING_MIN_GOLFERS)
      );
      const successUrl = withCheckoutSessionId(
        getCheckoutRedirectUrl(req.body?.successUrl, DEFAULT_SUCCESS_URL),
      );
      const cancelUrl = getCheckoutRedirectUrl(req.body?.cancelUrl, DEFAULT_CANCEL_URL);

      if (!isCheckoutPurpose(requestedPurpose)) {
        return res.status(400).json({ message: 'Invalid checkout purpose' });
      }
      const purpose = requestedPurpose;
      if (!Number.isInteger(requestedGolfers) || requestedGolfers < 1 || requestedGolfers > 10000) {
        return res.status(400).json({ message: 'Requested golfers must be a whole number from 1 to 10000' });
      }

      if (!DEFAULT_PRICE_ID && BILLING_PRICE_PER_GOLFER_CENTS <= 0) {
        return res.status(500).json({ message: 'Invalid billing configuration' });
      }

      const currentMetadata =
        user.metadata && typeof user.metadata === 'object' ? user.metadata : {};
      const currentStripeMetadata =
        currentMetadata &&
        typeof currentMetadata === 'object' &&
        'stripe' in currentMetadata &&
        (currentMetadata as any).stripe &&
        typeof (currentMetadata as any).stripe === 'object'
          ? (currentMetadata as any).stripe
          : {};
      const currentBillingMetadata = getBillingMetadata(currentMetadata);
      const currentIncludedGolfers = Math.max(0, Number(currentBillingMetadata.includedGolfers || 0));

      let capacityLeague: { id: number; numPlayers: number; billingExempt: boolean } | null = null;
      if (purpose === 'league_capacity') {
        if (!Number.isInteger(leagueId) || leagueId <= 0) {
          return res.status(400).json({ message: 'League ID is required for a capacity upgrade' });
        }
        capacityLeague = await prisma.league.findFirst({
          where: { id: leagueId, adminId: user.id, deletedAt: null },
          select: { id: true, numPlayers: true, billingExempt: true },
        });
        if (!capacityLeague) {
          return res.status(404).json({ message: 'League not found' });
        }
      }

      const targetGolfers =
        purpose === 'league_capacity' && capacityLeague
          ? Math.max(capacityLeague.numPlayers, requestedGolfers)
          : purpose === 'registration'
          ? Math.max(BILLING_MIN_GOLFERS, requestedGolfers || BILLING_MIN_GOLFERS)
          : Math.max(currentIncludedGolfers, requestedGolfers);
      const quantity = Math.max(
        0,
        purpose === 'league_capacity' && capacityLeague
          ? targetGolfers - capacityLeague.numPlayers
          : targetGolfers - currentIncludedGolfers,
      );

      const allocatedGolfers = await getAllocatedGolfersForAdmin(user.id);
      const billingState = getBillingState(currentMetadata, allocatedGolfers);
      const bypassesCheckout =
        Boolean(capacityLeague?.billingExempt) ||
        (purpose !== 'league_capacity' && billingState.hasPendingLeagueBypass);
      if (bypassesCheckout) {
        if (purpose === 'league_capacity' && capacityLeague) {
          await prisma.$transaction(async (tx) => {
            await lockAdminBilling(tx, user.id);
            await lockLeagueCapacity(tx, capacityLeague.id);
            const lockedLeague = await tx.league.findFirst({
              where: { id: capacityLeague.id, adminId: user.id, deletedAt: null },
              select: { id: true, numPlayers: true, billingExempt: true },
            });
            if (!lockedLeague) throw new Error('League not found');
            if (!lockedLeague.billingExempt) {
              throw new Error('Payment is required for this capacity change.');
            }
            await tx.league.update({
              where: { id: lockedLeague.id },
              data: { numPlayers: Math.max(lockedLeague.numPlayers, targetGolfers) },
            });
          });
        }
        return res.status(200).json({
          alreadyCovered: true,
          paymentExempt: false,
          leagueBypassPending: billingState.hasPendingLeagueBypass,
          sessionId: null,
          url: null,
          customerId: currentStripeMetadata.customerId || null,
          priceId: DEFAULT_PRICE_ID || null,
          quantity: 0,
          targetGolfers,
        });
      }

      if (quantity <= 0) {
        return res.status(200).json({
          alreadyCovered: true,
          sessionId: null,
          url: null,
          customerId: currentStripeMetadata.customerId || null,
          priceId: DEFAULT_PRICE_ID || null,
          quantity: 0,
          targetGolfers,
        });
      }

      if (!process.env.STRIPE_SECRET_KEY) {
        return res.status(500).json({ message: 'Missing STRIPE_SECRET_KEY' });
      }

      const customerId = await resolveStripeCustomerId(
        typeof currentStripeMetadata.customerId === 'string'
          ? currentStripeMetadata.customerId
          : undefined,
        user,
      );

      const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = DEFAULT_PRICE_ID
        ? {
            price: DEFAULT_PRICE_ID,
            quantity,
          }
        : {
            price_data: {
              currency: BILLING_CURRENCY,
              unit_amount: BILLING_PRICE_PER_GOLFER_CENTS,
              product_data: {
                name: getProductName(purpose, quantity),
                tax_code: PRODUCT_TAX_CODE,
              },
            },
            quantity,
          };

      const checkoutSession = await stripe.checkout.sessions.create({
        line_items: [lineItem],
        mode: 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer: customerId,
        client_reference_id: String(user.id),
        metadata: {
          purpose,
          quantity: String(quantity),
          targetGolfers: String(targetGolfers),
          ...(capacityLeague ? { leagueId: String(capacityLeague.id) } : {}),
        },
      });

      await prisma.user.update({
        where: { id: user.id },
        data: {
          metadata: mergeBillingMetadata(
            {
              ...(currentMetadata as object),
              stripe: {
                ...currentStripeMetadata,
                customerId,
                lastPriceId: DEFAULT_PRICE_ID || null,
                lastCheckoutSessionId: checkoutSession.id,
                lastCheckoutStatus: 'created',
                lastCheckoutPurpose: purpose,
              },
            },
            {
              minimumGolfers: BILLING_MIN_GOLFERS,
              pricePerGolferCents: BILLING_PRICE_PER_GOLFER_CENTS,
              currency: BILLING_CURRENCY,
              lastPendingCheckoutPurpose: purpose,
              lastPendingSeatQuantity: quantity,
              lastPendingTargetGolfers: targetGolfers,
            }
          ),
        },
      });

      return res.status(200).json({
        sessionId: checkoutSession.id,
        url: checkoutSession.url,
        customerId,
        priceId: DEFAULT_PRICE_ID || null,
        quantity,
        targetGolfers,
      });
    } catch (error: any) {
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'stripe:checkout-session-failed',
          requestId: (req as Request & { requestId?: string }).requestId ?? null,
          type: error?.type ?? null,
          code: error?.code ?? null,
          statusCode: error?.statusCode ?? null,
          message: error?.message || 'Unknown Stripe checkout error',
        }),
      );
      return res.status(500).json({ message: 'Failed to create checkout session' });
    }
  }

  static async redeemPaymentBypassCode(req: Request, res: Response) {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: 'Not authenticated' });

      const billing = await redeemPaymentBypassCode(userId, req.body?.code);
      if (!billing) {
        return res.status(400).json({
          message: 'That payment access code is invalid, expired, revoked, or already used.',
        });
      }

      return res.status(200).json({
        message: 'Payment access code applied to your next league creation.',
        billing,
      });
    } catch (error) {
      console.error('redeemPaymentBypassCode error:', error);
      return res.status(500).json({ message: 'Failed to apply payment access code' });
    }
  }

  static async confirmCheckoutSession(req: Request, res: Response) {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const sessionId = String(req.params.sessionId || '').trim();
    if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId) || sessionId.length > 255) {
      return res.status(400).json({ message: 'Invalid checkout session ID' });
    }

    try {
      const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['payment_intent'],
      });

      if (String(checkoutSession.client_reference_id || '') !== String(userId)) {
        return res.status(404).json({ message: 'Checkout session not found' });
      }

      const status = getCheckoutConfirmationStatus(checkoutSession);
      const returnedPurpose = String(checkoutSession.metadata?.purpose || 'seat_upgrade');
      const purpose: CheckoutPurpose = isCheckoutPurpose(returnedPurpose)
        ? returnedPurpose
        : 'seat_upgrade';

      if (status === 'succeeded') {
        const updatedUser = await applyCompletedCheckoutSession(checkoutSession);
        if (!updatedUser || updatedUser.id !== userId) {
          throw new Error('Paid checkout could not be applied to the current account');
        }
      }

      return res.status(200).json({
        sessionId: checkoutSession.id,
        status,
        purpose,
        message:
          status === 'processing'
            ? 'Your payment is still processing. Your saved work is safe; try confirming again shortly.'
            : status === 'failed'
              ? 'The payment was not completed. Your saved work is safe, and you can try checkout again.'
              : null,
      });
    } catch (error: any) {
      const notFound = isMissingStripeResource(error);
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'stripe:checkout-confirmation-failed',
          requestId: (req as Request & { requestId?: string }).requestId ?? null,
          sessionId,
          userId,
          type: error?.type ?? null,
          code: error?.code ?? null,
          statusCode: error?.statusCode ?? null,
          message: error?.message || 'Unknown Stripe checkout confirmation error',
        }),
      );
      return res.status(notFound ? 404 : 503).json({
        message: notFound
          ? 'Checkout session not found'
          : 'We could not confirm the payment right now. Your saved work is safe; please try again.',
      });
    }
  }

  static async getStripeState(req: Request, res: Response) {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      let user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, metadata: true },
      });

      const initialMetadata = user?.metadata && typeof user.metadata === 'object' ? user.metadata : {};
      const initialStripeState = (initialMetadata as any)?.stripe || null;
      const lastCheckoutSessionId =
        typeof initialStripeState?.lastCheckoutSessionId === 'string'
          ? initialStripeState.lastCheckoutSessionId
          : '';

      if (
        lastCheckoutSessionId &&
        initialStripeState?.lastCheckoutStatus !== 'completed'
      ) {
        const checkoutSession = await stripe.checkout.sessions.retrieve(lastCheckoutSessionId);
        const updatedUser = await applyCompletedCheckoutSession(checkoutSession);
        if (updatedUser && updatedUser.id === user?.id) {
          user = { id: updatedUser.id, metadata: updatedUser.metadata };
        }
      }

      const metadata = user?.metadata && typeof user.metadata === 'object' ? user.metadata : {};
      const stripeState = (metadata as any)?.stripe || null;
      const allocatedGolfers = user?.id ? await getAllocatedGolfersForAdmin(user.id) : 0;
      const billingState = getBillingState(metadata, allocatedGolfers);

      return res.status(200).json({ stripe: stripeState, billing: billingState });
    } catch (error: any) {
      console.error('getStripeState error:', error);
      return res.status(500).json({ message: 'Failed to read Stripe state' });
    }
  }

  static async handleWebhook(req: Request, res: Response) {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const signature = req.headers['stripe-signature'];

    if (!webhookSecret) {
      return res.status(500).send('Missing STRIPE_WEBHOOK_SECRET');
    }

    if (!signature || Array.isArray(signature)) {
      return res.status(400).send('Missing stripe-signature header');
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    } catch (err: any) {
      return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
    }

    try {
      if (
        event.type === 'checkout.session.completed' ||
        event.type === 'checkout.session.async_payment_succeeded'
      ) {
        const session = event.data.object as Stripe.Checkout.Session;
        await applyCompletedCheckoutSession(session);
      } else if (event.type === 'charge.refunded') {
        await applyRefundedCharge(event.data.object as Stripe.Charge);
      } else if (event.type === 'charge.dispute.closed') {
        await applyLostDispute(event.data.object as Stripe.Dispute);
      }

      return res.json({ received: true });
    } catch (error: any) {
      console.error('handleWebhook error:', error);
      return res.status(500).json({ message: 'Webhook handling failed' });
    }
  }
}

export default PaymentController;
