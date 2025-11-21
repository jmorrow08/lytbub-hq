import { supabase } from './supabaseClient';
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js';
import type { CheckoutSessionResponse, Project, Client } from '@/types';

const CHECKOUT_API_ROUTE = '/api/finance/create-checkout';
const EDGE_FUNCTION_NAME = 'stripe_checkout_create';
const API_TIMEOUT_MS = 10_000;

type CheckoutPayload = {
  amountCents: number;
  description?: string;
  projectId?: string;
  clientId?: string;
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number) => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('Payment service timed out. Please try again.'));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const callCheckoutApiRoute = async (
  payload: CheckoutPayload,
  accessToken: string
): Promise<CheckoutSessionResponse> => {
  const request = fetch(CHECKOUT_API_ROUTE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  const response = await withTimeout(request, API_TIMEOUT_MS);
  const data = (await response.json().catch(() => ({}))) as CheckoutSessionResponse & {
    error?: string;
  };

  if (!response.ok || !data?.url || !data?.paymentId) {
    throw new Error(data?.error || 'Checkout API returned an error.');
  }

  return data;
};

const callSupabaseEdgeFunction = async (
  payload: CheckoutPayload,
  accessToken: string
): Promise<CheckoutSessionResponse> => {
  const { data, error } = await supabase.functions.invoke(EDGE_FUNCTION_NAME, {
    body: payload,
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      try {
        const details = await error.context.json();
        const message =
          (typeof details === 'string' ? details : details?.error || details?.message) ||
          'Payment service returned an error.';
        throw new Error(message);
      } catch (parseError) {
        console.error('Unable to parse Supabase Edge Function error response', parseError);
        throw new Error('Payment service returned an error.');
      }
    }
    if (error instanceof FunctionsRelayError || error instanceof FunctionsFetchError) {
      throw new Error(error.message || 'Payment service returned an error.');
    }
    throw new Error('Payment service returned an error.');
  }

  const payloadData = (data as CheckoutSessionResponse | null) ?? null;
  if (!payloadData?.url || !payloadData?.paymentId) {
    throw new Error('Payment service returned an invalid response.');
  }

  return payloadData;
};

export async function executeStripeCheckout(
  amountUsd: number,
  description?: string,
  client?: Pick<Client, 'id' | 'name'> | null,
  project?: Pick<Project, 'id' | 'name'> | null
): Promise<CheckoutSessionResponse> {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    throw new Error('Enter a positive payment amount.');
  }

  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) {
    throw new Error('You must be signed in to create a payment link.');
  }

  const payload: CheckoutPayload = {
    amountCents: Math.round(amountUsd * 100),
    description: description?.trim() || undefined,
    clientId: client?.id || undefined,
    projectId: project?.id || undefined,
  };

  let apiError: Error | null = null;
  try {
    return await callCheckoutApiRoute(payload, accessToken);
  } catch (error) {
    apiError = error instanceof Error ? error : new Error('Checkout API failed.');
    console.warn('Checkout API route failed, trying Supabase Edge Function fallback', apiError);
  }

  try {
    return await callSupabaseEdgeFunction(payload, accessToken);
  } catch (fallbackError) {
    const fallbackMessage =
      fallbackError instanceof Error ? fallbackError.message : 'Checkout fallback failed.';
    const apiMessage = apiError?.message ? ` API: ${apiError.message}` : '';
    throw new Error(`${fallbackMessage}.${apiMessage}`.trim());
  }
}
