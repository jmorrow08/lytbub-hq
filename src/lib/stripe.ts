'use server';

import Stripe from 'stripe';

const STRIPE_API_VERSION: Stripe.LatestApiVersion = '2024-06-20';
const APP_INFO: Stripe.AppInfo = {
  name: 'Lytbub HQ',
  version: '0.1.0',
};

let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('Missing STRIPE_SECRET_KEY environment variable.');
  }

  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: STRIPE_API_VERSION,
      appInfo: APP_INFO,
    });
  }

  return stripeClient;
}

function getAllowedPaymentMethodTypes():
  | Stripe.InvoiceCreateParams.PaymentSettings.PaymentMethodType[]
  | Stripe.SubscriptionCreateParams.PaymentSettings.PaymentMethodType[] {
  const raw =
    process.env.STRIPE_PAYMENT_METHOD_TYPES ||
    process.env.NEXT_PUBLIC_STRIPE_PAYMENT_METHOD_TYPES ||
    'card,us_bank_account,link';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean) as any;
}

type CustomerPayload = {
  customerId?: string | null;
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  metadata?: Stripe.MetadataParam;
  address?: Stripe.AddressParam;
  taxId?: string | null;
};

export async function createOrUpdateCustomer(payload: CustomerPayload): Promise<Stripe.Customer> {
  const stripe = getStripe();
  const derivedMetadata = {
    ...(payload.metadata || {}),
    ...(payload.taxId ? { tax_id_reference: payload.taxId } : {}),
  };
  const metadata: Stripe.MetadataParam | undefined =
    Object.keys(derivedMetadata).length > 0 ? derivedMetadata : undefined;

  if (payload.customerId) {
    return stripe.customers.update(payload.customerId, {
      email: payload.email ?? undefined,
      name: payload.name ?? undefined,
      phone: payload.phone ?? undefined,
      metadata,
      address: payload.address,
    });
  }

  return stripe.customers.create({
    email: payload.email ?? undefined,
    name: payload.name ?? undefined,
    phone: payload.phone ?? undefined,
    metadata,
    address: payload.address,
    tax_exempt: 'none',
  });
}

type AttachPaymentMethodArgs = {
  customerId: string;
  paymentMethodId: string;
  makeDefault?: boolean;
};

export async function attachPaymentMethod({
  customerId,
  paymentMethodId,
  makeDefault = true,
}: AttachPaymentMethodArgs): Promise<Stripe.PaymentMethod> {
  const stripe = getStripe();
  await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });

  if (makeDefault) {
    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });
  }

  return stripe.paymentMethods.retrieve(paymentMethodId);
}

type DraftInvoiceArgs = {
  customerId: string;
  subscriptionId?: string | null;
  collectionMethod?: 'charge_automatically' | 'send_invoice';
  dueDate?: number | null;
  metadata?: Stripe.MetadataParam;
  footer?: string;
  description?: string;
};

export async function createDraftInvoice({
  customerId,
  subscriptionId,
  collectionMethod = 'charge_automatically',
  dueDate = null,
  metadata,
  footer,
  description,
}: DraftInvoiceArgs): Promise<Stripe.Invoice> {
  const stripe = getStripe();
  const paymentMethodTypes = getAllowedPaymentMethodTypes() as
    | Stripe.InvoiceCreateParams.PaymentSettings.PaymentMethodType[]
    | undefined;
  return stripe.invoices.create({
    customer: customerId,
    subscription: subscriptionId ?? undefined,
    collection_method: collectionMethod,
    due_date: dueDate ?? undefined,
    auto_advance: false,
    metadata,
    footer,
    description,
    automatic_tax: { enabled: true },
    payment_settings:
      collectionMethod === 'charge_automatically'
        ? {
            payment_method_types: paymentMethodTypes,
          }
        : paymentMethodTypes
        ? { payment_method_types: paymentMethodTypes }
        : undefined,
  });
}

type InvoiceLineItemArgs = {
  customerId: string;
  invoiceId?: string | null;
  description: string;
  amountCents: number;
  quantity?: number;
  metadata?: Stripe.MetadataParam;
  priceData?: Stripe.InvoiceItemCreateParams.PriceData;
};

export async function addInvoiceLineItem({
  customerId,
  invoiceId,
  description,
  amountCents,
  quantity = 1,
  metadata,
  priceData,
}: InvoiceLineItemArgs): Promise<Stripe.InvoiceItem> {
  const stripe = getStripe();

  const payload: Stripe.InvoiceItemCreateParams = {
    customer: customerId,
    description,
    metadata,
    quantity,
  };

  if (priceData) {
    payload.price_data = priceData;
  } else {
    payload.currency = 'usd';
    payload.unit_amount = Math.round(amountCents);
  }

  if (invoiceId) {
    payload.invoice = invoiceId;
  }

  return stripe.invoiceItems.create(payload);
}

export async function finalizeAndSendInvoice(
  invoiceId: string,
  { sendImmediately = true }: { sendImmediately?: boolean } = {},
): Promise<Stripe.Invoice> {
  const stripe = getStripe();
  const finalized = await stripe.invoices.finalizeInvoice(invoiceId, { auto_advance: true });

  if (sendImmediately && finalized.collection_method === 'send_invoice') {
    await stripe.invoices.sendInvoice(finalized.id);
  }

  return finalized;
}

type SubscriptionArgs = {
  customerId: string;
  amountCents: number;
  productName: string;
  metadata?: Stripe.MetadataParam;
  paymentBehavior?: Stripe.SubscriptionCreateParams.PaymentBehavior;
  defaultPaymentMethod?: string;
};

export async function setupSubscription({
  customerId,
  amountCents,
  productName,
  metadata,
  paymentBehavior = 'default_incomplete',
  defaultPaymentMethod,
}: SubscriptionArgs): Promise<Stripe.Subscription> {
  const stripe = getStripe();
  const paymentMethodTypes = ((getAllowedPaymentMethodTypes() as
    | Stripe.SubscriptionCreateParams.PaymentSettings.PaymentMethodType[]
    | undefined) || [
    'card',
    'us_bank_account',
  ]) as Stripe.SubscriptionCreateParams.PaymentSettings.PaymentMethodType[];

  const price = await stripe.prices.create({
    currency: 'usd',
    unit_amount: Math.round(amountCents),
    recurring: { interval: 'month' },
    product_data: {
      name: productName,
    },
  });

  return stripe.subscriptions.create({
    customer: customerId,
    description: productName,
    metadata,
    payment_behavior: paymentBehavior,
    default_payment_method: defaultPaymentMethod,
    collection_method: 'charge_automatically',
    items: [
      {
        price: price.id,
      },
    ],
    automatic_tax: { enabled: true },
    payment_settings: {
      save_default_payment_method: 'on_subscription',
      payment_method_types: paymentMethodTypes,
    },
  });
}

type TaxCalculationArgs = {
  customerId: string;
  lineItems: Array<{
    amountCents: number;
    quantity?: number;
    taxCode?: string;
    productName?: string;
  }>;
};

export async function calculateTax({
  customerId,
  lineItems,
}: TaxCalculationArgs): Promise<Stripe.Tax.Calculation> {
  const stripe = getStripe();

  return stripe.tax.calculations.create({
    customer: customerId,
    currency: 'usd',
    line_items: lineItems.map((line) => ({
      amount: Math.round(line.amountCents),
      reference: line.productName,
      tax_code: line.taxCode,
      quantity: line.quantity ?? 1,
    })),
  });
}

export async function ensureStripeConfigured(): Promise<void> {
  getStripe();
}

/**
 * Creates a Stripe Billing Portal session for a given customer.
 */
export async function createBillingPortalSession({
  customerId,
  returnUrl,
  configurationId,
}: {
  customerId: string;
  returnUrl: string;
  configurationId?: string;
}): Promise<Stripe.BillingPortal.Session> {
  const stripe = getStripe();
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
    configuration: configurationId,
  });
}
