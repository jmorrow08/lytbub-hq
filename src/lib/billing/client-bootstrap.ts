'use server';

import type { User } from '@supabase/supabase-js';
import { getServiceRoleClient } from '@/lib/supabaseAdmin';

const parseSuperAdminEmails = (): string[] => {
  const raw = process.env.SUPER_ADMIN_EMAILS || process.env.SUPER_ADMINS || '';
  return raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
};

const resolveBillingOwnerId = async (
  service: ReturnType<typeof getServiceRoleClient>,
  emailList: string[],
) => {
  if (!emailList.length) return null;
  try {
    const { data, error } = await service.auth.admin.listUsers({ perPage: 1000 });
    if (error) {
      console.error('[billing bootstrap] listUsers failed', error);
      return null;
    }

    const normalized = emailList.map((item) => item.toLowerCase());
    const match = (data?.users ?? []).find((user) =>
      user.email ? normalized.includes(user.email.toLowerCase()) : false,
    );

    return match?.id ?? null;
  } catch (error) {
    console.error('[billing bootstrap] resolveBillingOwnerId failed', error);
  }
  return null;
};

type MembershipRow = {
  client_id: string;
  client:
    | { id: string; created_by: string | null }
    | Array<{ id: string; created_by: string | null }>
    | null;
};

export const ensureClientForUser = async (user: User | null): Promise<string | null> => {
  if (!user?.id) return null;
  let service;
  try {
    service = getServiceRoleClient();
  } catch (error) {
    console.error('[billing bootstrap] service client unavailable', error);
    return null;
  }
  const superAdminEmails = parseSuperAdminEmails();
  const ownerId = (await resolveBillingOwnerId(service, superAdminEmails)) ?? null;
  const memberEmail =
    user.email?.toLowerCase() ||
    (typeof user.user_metadata?.email === 'string' ? user.user_metadata.email.toLowerCase() : null) ||
    `user-${user.id}@unknown.ltybub`;

  try {
    const { data: existingMembership, error: membershipLookupError } = await service
      .from('client_users')
      .select('client_id, client:clients(id, created_by)')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle<MembershipRow>();

    if (membershipLookupError) {
      console.error('[billing bootstrap] membership lookup failed', membershipLookupError);
      return null;
    }

    if (existingMembership?.client_id) {
      const clientRow = Array.isArray(existingMembership.client)
        ? existingMembership.client[0]
        : existingMembership.client;

      if (ownerId && clientRow?.created_by !== ownerId) {
        await service
          .from('clients')
          .update({ created_by: ownerId, updated_at: new Date().toISOString() })
          .eq('id', existingMembership.client_id);
      }
      return existingMembership.client_id;
    }

    let existingClientQuery = service
      .from('clients')
      .select('id, created_by')
      .eq('email', memberEmail)
      .order('created_at', { ascending: true })
      .limit(1);

    if (ownerId) {
      existingClientQuery = existingClientQuery.eq('created_by', ownerId);
    }

    const { data: existingClient, error: clientLookupError } = await existingClientQuery.maybeSingle();

    if (clientLookupError) {
      console.error('[billing bootstrap] client lookup failed', clientLookupError);
      return null;
    }

    const clientId =
      existingClient?.id ??
      (await service
        .from('clients')
        .insert({
          name: user.user_metadata?.full_name || user.email || 'New Lytbub user',
          contact_name: user.user_metadata?.full_name || null,
          email: memberEmail,
          created_by: ownerId || user.id,
          notes: 'Auto-created for new signup',
        })
        .select('id')
        .single()).data?.id;

    if (!clientId) {
      console.error('[billing bootstrap] Unable to create or find client for user', user.id);
      return null;
    }

    if (ownerId && existingClient && existingClient.created_by !== ownerId) {
      await service
        .from('clients')
        .update({ created_by: ownerId, updated_at: new Date().toISOString() })
        .eq('id', clientId);
    }

    const { error: linkError } = await service
      .from('client_users')
      .upsert(
        { client_id: clientId, user_id: user.id, email: memberEmail, role: 'owner' },
        { onConflict: 'client_id,user_id' },
      );

    if (linkError) {
      console.error('[billing bootstrap] linking client to user failed', linkError);
    }

    return clientId;
  } catch (error) {
    console.error('[billing bootstrap] ensureClientForUser failed', error);
    return null;
  }
};
