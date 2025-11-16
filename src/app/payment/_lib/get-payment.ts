import { createClient } from '@supabase/supabase-js';

type PaymentProject = {
  id: string;
  name?: string | null;
} | null;

export type PaymentDetails = {
  id: string;
  amount_cents: number;
  currency: string;
  description?: string | null;
  created_at: string;
  status?: string | null;
  url: string;
  project?: PaymentProject;
};

const resolveSupabaseConfig = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('[payment pages] Missing Supabase environment variables');
    return null;
  }

  return { supabaseUrl, supabaseKey };
};

export async function fetchPaymentDetails(
  paymentId: string
): Promise<PaymentDetails | null> {
  const config = resolveSupabaseConfig();
  if (!config) return null;

  const supabase = createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from('payments')
    .select(
      `
        id,
        amount_cents,
        currency,
        description,
        created_at,
        status,
        url,
        project:projects (
          id,
          name
        )
      `
    )
    .eq('id', paymentId)
    .maybeSingle();

  if (error) {
    console.error('[payment pages] Failed to fetch payment details', error);
    return null;
  }

  return data as PaymentDetails | null;
}
