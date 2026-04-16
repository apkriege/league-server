import { Request, Response } from 'express';
import Stripe from 'stripe';
import { prisma } from '../../prisma';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

const DEFAULT_SUCCESS_URL =
  process.env.STRIPE_CHECKOUT_SUCCESS_URL ||
  `${process.env.CLIENT_URL || 'http://localhost:5173'}/admin/league/create?checkout=success`;
const DEFAULT_CANCEL_URL =
  process.env.STRIPE_CHECKOUT_CANCEL_URL ||
  `${process.env.CLIENT_URL || 'http://localhost:5173'}/admin/league/create?checkout=cancel`;

class PaymentController {
  static async createCheckoutSession(req: Request, res: Response) {
    try {
      if (!process.env.STRIPE_SECRET_KEY) {
        return res.status(500).json({ message: 'Missing STRIPE_SECRET_KEY' });
      }

      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const {
        productName = 'Example Product',
        unitAmount = 2000,
        currency = 'usd',
        quantity = 1,
        successUrl = DEFAULT_SUCCESS_URL,
        cancelUrl = DEFAULT_CANCEL_URL,
      } = req.body || {};

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

      let customerId: string | undefined = currentStripeMetadata.customerId;

      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          metadata: { userId: String(user.id) },
        });
        customerId = customer.id;
      }

      const product = await stripe.products.create({
        name: productName,
        default_price_data: {
          currency,
          unit_amount: Number(unitAmount),
        },
      });

      const defaultPriceId =
        typeof product.default_price === 'string' ? product.default_price : undefined;

      if (!defaultPriceId) {
        return res.status(500).json({ message: 'Stripe product missing default price' });
      }

      const checkoutSession = await stripe.checkout.sessions.create({
        line_items: [
          {
            price: defaultPriceId,
            quantity: Number(quantity),
          },
        ],
        mode: 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer: customerId,
        client_reference_id: String(user.id),
      });

      await prisma.user.update({
        where: { id: user.id },
        data: {
          metadata: {
            ...(currentMetadata as object),
            stripe: {
              ...currentStripeMetadata,
              customerId,
              lastProductId: product.id,
              lastPriceId: defaultPriceId,
              lastCheckoutSessionId: checkoutSession.id,
              lastCheckoutStatus: 'created',
            },
          },
        },
      });

      return res.status(200).json({
        sessionId: checkoutSession.id,
        url: checkoutSession.url,
        customerId,
        productId: product.id,
        defaultPriceId,
      });
    } catch (error: any) {
      console.error('createCheckoutSession error:', error);
      return res
        .status(500)
        .json({ message: error?.message || 'Failed to create checkout session' });
    }
  }

  static async getStripeState(req: Request, res: Response) {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { metadata: true },
      });
      const metadata = user?.metadata && typeof user.metadata === 'object' ? user.metadata : {};
      const stripeState = (metadata as any)?.stripe || null;

      return res.status(200).json({ stripe: stripeState });
    } catch (error: any) {
      console.error('getStripeState error:', error);
      return res.status(500).json({ message: error?.message || 'Failed to read Stripe state' });
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
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;

        const userIdFromReference = Number(session.client_reference_id);
        if (userIdFromReference) {
          const user = await prisma.user.findUnique({ where: { id: userIdFromReference } });
          if (user) {
            const currentMetadata =
              user.metadata && typeof user.metadata === 'object' ? user.metadata : {};
            const currentStripeMetadata =
              (currentMetadata as any)?.stripe &&
              typeof (currentMetadata as any).stripe === 'object'
                ? (currentMetadata as any).stripe
                : {};

            await prisma.user.update({
              where: { id: user.id },
              data: {
                metadata: {
                  ...(currentMetadata as object),
                  stripe: {
                    ...currentStripeMetadata,
                    customerId:
                      typeof session.customer === 'string'
                        ? session.customer
                        : currentStripeMetadata.customerId,
                    lastCheckoutSessionId: session.id,
                    lastCheckoutStatus: 'completed',
                    lastPaymentIntentId:
                      typeof session.payment_intent === 'string' ? session.payment_intent : null,
                    lastCompletedAt: new Date().toISOString(),
                  },
                },
              },
            });
          }
        }
      }

      return res.json({ received: true });
    } catch (error: any) {
      console.error('handleWebhook error:', error);
      return res.status(500).json({ message: error?.message || 'Webhook handling failed' });
    }
  }
}

export default PaymentController;
