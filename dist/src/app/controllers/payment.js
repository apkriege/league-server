"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const stripe_1 = __importDefault(require("stripe"));
const prisma_1 = require("../../prisma");
const origins_1 = require("../utils/origins");
const billing_1 = require("../utils/billing");
const stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY || '');
const defaultClientOrigin = (0, origins_1.getPrimaryClientOrigin)() || 'http://localhost:5173';
const DEFAULT_SUCCESS_URL = process.env.STRIPE_CHECKOUT_SUCCESS_URL ||
    `${defaultClientOrigin}/leagues?checkout=registration_success`;
const DEFAULT_CANCEL_URL = process.env.STRIPE_CHECKOUT_CANCEL_URL ||
    `${defaultClientOrigin}/?checkout=registration_cancel#register`;
const DEFAULT_PRICE_ID = process.env.STRIPE_PRICE_ID || '';
const getProductName = (purpose, quantity) => {
    if (purpose === 'registration') {
        return `League Admin Registration (${quantity} golfers included)`;
    }
    return `Additional golfer seats (${quantity})`;
};
const applyCompletedCheckoutSession = async (session) => {
    const userIdFromReference = Number(session.client_reference_id);
    if (!userIdFromReference)
        return null;
    if (session.payment_status !== 'paid' && session.status !== 'complete') {
        return null;
    }
    const user = await prisma_1.prisma.user.findUnique({ where: { id: userIdFromReference } });
    if (!user)
        return null;
    const currentMetadata = user.metadata && typeof user.metadata === 'object' ? user.metadata : {};
    const currentStripeMetadata = currentMetadata?.stripe && typeof currentMetadata.stripe === 'object'
        ? currentMetadata.stripe
        : {};
    const currentBillingMetadata = (0, billing_1.getBillingMetadata)(currentMetadata);
    if (currentStripeMetadata.lastCheckoutSessionId === session.id &&
        currentStripeMetadata.lastCheckoutStatus === 'completed') {
        return user;
    }
    const completedQuantity = Math.max(0, Number(session.metadata?.quantity || 0));
    const requestedTargetGolfers = Math.max(0, Number(session.metadata?.targetGolfers || 0));
    const completedPurpose = String(session.metadata?.purpose || 'seat_upgrade');
    const currentIncludedGolfers = Math.max(0, Number(currentBillingMetadata.includedGolfers || 0));
    const nextIncludedGolfers = Math.max(currentIncludedGolfers + completedQuantity, requestedTargetGolfers, currentIncludedGolfers);
    return prisma_1.prisma.user.update({
        where: { id: user.id },
        data: {
            metadata: (0, billing_1.mergeBillingMetadata)({
                ...currentMetadata,
                stripe: {
                    ...currentStripeMetadata,
                    customerId: typeof session.customer === 'string'
                        ? session.customer
                        : currentStripeMetadata.customerId,
                    lastCheckoutSessionId: session.id,
                    lastCheckoutStatus: 'completed',
                    lastCheckoutPurpose: completedPurpose,
                    lastPaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
                    lastCompletedAt: new Date().toISOString(),
                },
            }, {
                includedGolfers: nextIncludedGolfers,
                minimumGolfers: billing_1.BILLING_MIN_GOLFERS,
                pricePerGolferCents: billing_1.BILLING_PRICE_PER_GOLFER_CENTS,
                currency: billing_1.BILLING_CURRENCY,
                lastCompletedCheckoutPurpose: completedPurpose,
                lastCompletedSeatQuantity: completedQuantity,
                lastCompletedTargetGolfers: requestedTargetGolfers,
                registrationCompletedAt: completedPurpose === 'registration'
                    ? new Date().toISOString()
                    : currentBillingMetadata.registrationCompletedAt || null,
            }),
        },
    });
};
class PaymentController {
    static async createCheckoutSession(req, res) {
        try {
            if (!process.env.STRIPE_SECRET_KEY) {
                return res.status(500).json({ message: 'Missing STRIPE_SECRET_KEY' });
            }
            const userId = req.session.userId;
            if (!userId) {
                return res.status(401).json({ message: 'Not authenticated' });
            }
            const user = await prisma_1.prisma.user.findUnique({ where: { id: userId } });
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }
            const purpose = String(req.body?.purpose || 'seat_upgrade');
            const requestedGolfers = Math.max(0, Number(req.body?.requestedGolfers ?? req.body?.quantity ?? billing_1.BILLING_MIN_GOLFERS));
            const successUrl = typeof req.body?.successUrl === 'string' && req.body.successUrl.trim().length > 0
                ? req.body.successUrl.trim()
                : DEFAULT_SUCCESS_URL;
            const cancelUrl = typeof req.body?.cancelUrl === 'string' && req.body.cancelUrl.trim().length > 0
                ? req.body.cancelUrl.trim()
                : DEFAULT_CANCEL_URL;
            if (!['registration', 'seat_upgrade'].includes(purpose)) {
                return res.status(400).json({ message: 'Invalid checkout purpose' });
            }
            if (!DEFAULT_PRICE_ID && billing_1.BILLING_PRICE_PER_GOLFER_CENTS <= 0) {
                return res.status(500).json({ message: 'Invalid billing configuration' });
            }
            const currentMetadata = user.metadata && typeof user.metadata === 'object' ? user.metadata : {};
            const currentStripeMetadata = currentMetadata &&
                typeof currentMetadata === 'object' &&
                'stripe' in currentMetadata &&
                currentMetadata.stripe &&
                typeof currentMetadata.stripe === 'object'
                ? currentMetadata.stripe
                : {};
            const currentBillingMetadata = (0, billing_1.getBillingMetadata)(currentMetadata);
            const currentIncludedGolfers = Math.max(0, Number(currentBillingMetadata.includedGolfers || 0));
            const targetGolfers = purpose === 'registration'
                ? Math.max(billing_1.BILLING_MIN_GOLFERS, requestedGolfers || billing_1.BILLING_MIN_GOLFERS)
                : Math.max(currentIncludedGolfers, requestedGolfers);
            const quantity = Math.max(0, purpose === 'registration'
                ? targetGolfers - currentIncludedGolfers
                : targetGolfers - currentIncludedGolfers);
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
            let customerId = currentStripeMetadata.customerId;
            if (!customerId) {
                const customer = await stripe.customers.create({
                    email: user.email,
                    name: `${user.firstName} ${user.lastName}`,
                    metadata: { userId: String(user.id) },
                });
                customerId = customer.id;
            }
            const lineItem = DEFAULT_PRICE_ID
                ? {
                    price: DEFAULT_PRICE_ID,
                    quantity,
                }
                : {
                    price_data: {
                        currency: billing_1.BILLING_CURRENCY,
                        unit_amount: billing_1.BILLING_PRICE_PER_GOLFER_CENTS,
                        product_data: {
                            name: getProductName(purpose, quantity),
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
                },
            });
            await prisma_1.prisma.user.update({
                where: { id: user.id },
                data: {
                    metadata: (0, billing_1.mergeBillingMetadata)({
                        ...currentMetadata,
                        stripe: {
                            ...currentStripeMetadata,
                            customerId,
                            lastPriceId: DEFAULT_PRICE_ID || null,
                            lastCheckoutSessionId: checkoutSession.id,
                            lastCheckoutStatus: 'created',
                            lastCheckoutPurpose: purpose,
                        },
                    }, {
                        minimumGolfers: billing_1.BILLING_MIN_GOLFERS,
                        pricePerGolferCents: billing_1.BILLING_PRICE_PER_GOLFER_CENTS,
                        currency: billing_1.BILLING_CURRENCY,
                        lastPendingCheckoutPurpose: purpose,
                        lastPendingSeatQuantity: quantity,
                        lastPendingTargetGolfers: targetGolfers,
                    }),
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
        }
        catch (error) {
            console.error('createCheckoutSession error:', error);
            return res
                .status(500)
                .json({ message: error?.message || 'Failed to create checkout session' });
        }
    }
    static async getStripeState(req, res) {
        try {
            const userId = req.session.userId;
            if (!userId) {
                return res.status(401).json({ message: 'Not authenticated' });
            }
            let user = await prisma_1.prisma.user.findUnique({
                where: { id: userId },
                select: { id: true, metadata: true },
            });
            const initialMetadata = user?.metadata && typeof user.metadata === 'object' ? user.metadata : {};
            const initialStripeState = initialMetadata?.stripe || null;
            const lastCheckoutSessionId = typeof initialStripeState?.lastCheckoutSessionId === 'string'
                ? initialStripeState.lastCheckoutSessionId
                : '';
            if (lastCheckoutSessionId && initialStripeState?.lastCheckoutStatus !== 'completed') {
                const checkoutSession = await stripe.checkout.sessions.retrieve(lastCheckoutSessionId);
                const updatedUser = await applyCompletedCheckoutSession(checkoutSession);
                if (updatedUser && updatedUser.id === user?.id) {
                    user = { id: updatedUser.id, metadata: updatedUser.metadata };
                }
            }
            const metadata = user?.metadata && typeof user.metadata === 'object' ? user.metadata : {};
            const stripeState = metadata?.stripe || null;
            const allocatedGolfers = user?.id ? await (0, billing_1.getAllocatedGolfersForAdmin)(user.id) : 0;
            const billingState = (0, billing_1.getBillingState)(metadata, allocatedGolfers);
            return res.status(200).json({ stripe: stripeState, billing: billingState });
        }
        catch (error) {
            console.error('getStripeState error:', error);
            return res.status(500).json({ message: error?.message || 'Failed to read Stripe state' });
        }
    }
    static async handleWebhook(req, res) {
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        const signature = req.headers['stripe-signature'];
        if (!webhookSecret) {
            return res.status(500).send('Missing STRIPE_WEBHOOK_SECRET');
        }
        if (!signature || Array.isArray(signature)) {
            return res.status(400).send('Missing stripe-signature header');
        }
        let event;
        try {
            event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
        }
        catch (err) {
            return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
        }
        try {
            if (event.type === 'checkout.session.completed') {
                const session = event.data.object;
                await applyCompletedCheckoutSession(session);
            }
            return res.json({ received: true });
        }
        catch (error) {
            console.error('handleWebhook error:', error);
            return res.status(500).json({ message: error?.message || 'Webhook handling failed' });
        }
    }
}
exports.default = PaymentController;
