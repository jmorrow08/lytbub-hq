/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';

export type ClientPortalRole = 'viewer' | 'admin';

export type ClientPortalMembership = {
  clientId: string;
  role: ClientPortalRole;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getSupabaseKeys() {
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    throw new Error('Supabase environment variables are not fully configured.');
  }
  return {
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
    serviceKey: supabaseServiceKey,
  };
}

type Database = Record<string, unknown>;
type ServiceClient = ReturnType<typeof createClient<Database>>;

let cachedServiceClient: ServiceClient | null = null;

function getServiceClient(): ServiceClient {
  const { url, serviceKey } = getSupabaseKeys();
  if (!cachedServiceClient) {
    cachedServiceClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${serviceKey}` } },
    });
  }
  return cachedServiceClient;
}

export async function getAuthUserFromRequest(req: Request): Promise<User | null> {
  const { url, anonKey } = getSupabaseKeys();
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    console.error('[client-auth] Failed to read authenticated user', error);
    return null;
  }

  return user ?? null;
}

async function resolveClientIdFromShare(shareId: string): Promise<string | null> {
  const serviceClient = getServiceClient();
  const result = await (serviceClient.from('invoices') as any)
    .select('client_id, public_share_expires_at')
    .eq('public_share_id', shareId)
    .maybeSingle();
  const data =
    (result.data as { client_id: string; public_share_expires_at: string | null } | null) ?? null;
  const error = result.error;

  if (error) {
    console.error('[client-auth] Failed to resolve share link', { shareId, error });
    throw new Error('Unable to resolve share link.');
  }

  if (!data) {
    return null;
  }

  if (data.public_share_expires_at) {
    const expiry = new Date(data.public_share_expires_at);
    if (Number.isFinite(expiry.getTime()) && expiry.getTime() < Date.now()) {
      return null;
    }
  }

  return data.client_id ?? null;
}

async function fetchClientPortalInfo(clientId: string): Promise<{
  id: string;
  created_by: string;
  client_portal_enabled: boolean | null;
} | null> {
  const serviceClient = getServiceClient();
  const result = await (serviceClient.from('clients') as any)
    .select('id, created_by, client_portal_enabled')
    .eq('id', clientId)
    .maybeSingle();
  const data =
    (result.data as {
      id: string;
      created_by: string;
      client_portal_enabled: boolean | null;
    } | null) ?? null;
  const error = result.error;

  if (error) {
    console.error('[client-auth] Failed to load client portal info', { clientId, error });
    throw new Error('Unable to load client portal.');
  }

  return data;
}

export async function resolveClientMembership(
  userId: string,
  clientId: string,
): Promise<ClientPortalMembership | null> {
  const serviceClient = getServiceClient();
  const membershipResult = await (serviceClient.from('client_users') as any)
    .select('role')
    .eq('client_id', clientId)
    .eq('user_id', userId)
    .maybeSingle();
  const data = (membershipResult.data as { role: string } | null) ?? null;
  const error = membershipResult.error;

  if (error) {
    console.error('[client-auth] Failed to fetch client membership', { clientId, userId, error });
    throw new Error('Unable to load client membership.');
  }

  if (data) {
    return { clientId, role: data.role as ClientPortalRole };
  }

  const client = await fetchClientPortalInfo(clientId);
  if (client && client.created_by === userId) {
    return { clientId, role: 'admin' };
  }

  return null;
}

export async function ensureClientPortalAccess(options: {
  userId: string;
  clientId?: string | null;
  shareId?: string | null;
  requirePortalEnabled?: boolean;
}): Promise<{ membership: ClientPortalMembership; clientId: string }> {
  const { userId, shareId, clientId: explicitClientId, requirePortalEnabled = true } = options;
  let clientId = explicitClientId ?? null;

  if (!clientId && shareId) {
    clientId = await resolveClientIdFromShare(shareId);
    if (!clientId) {
      throw new Error('The provided share link is invalid or expired.');
    }
  }

  if (!clientId) {
    throw new Error('Unable to determine client access.');
  }

  const membership = await resolveClientMembership(userId, clientId);
  if (!membership) {
    throw new Error('You do not have access to this client portal.');
  }

  if (requirePortalEnabled) {
    const info = await fetchClientPortalInfo(clientId);
    if (info && info.client_portal_enabled === false) {
      throw new Error('Client portal access is disabled for this client.');
    }
  }

  return { membership, clientId };
}

export async function listClientMemberships(userId: string): Promise<ClientPortalMembership[]> {
  const serviceClient = getServiceClient();
  const listResult = await (serviceClient.from('client_users') as any)
    .select('client_id, role')
    .eq('user_id', userId);
  const data = (listResult.data as Array<{ client_id: string; role: string }> | null) ?? null;
  const error = listResult.error;

  if (error) {
    console.error('[client-auth] Failed to list client memberships', { userId, error });
    throw new Error('Unable to list client memberships.');
  }

  const memberships: ClientPortalMembership[] = (data ?? []).map((row) => ({
    clientId: row.client_id,
    role: row.role as ClientPortalRole,
  }));

  const ownedResult = await (serviceClient.from('clients') as any)
    .select('id')
    .eq('created_by', userId);
  const ownedClients = (ownedResult.data as Array<{ id: string }> | null) ?? null;
  const ownedError = ownedResult.error;

  if (ownedError) {
    console.error('[client-auth] Failed to load owned clients', { userId, error: ownedError });
    throw new Error('Unable to load owned clients.');
  }

  for (const client of ownedClients ?? []) {
    if (!memberships.some((item) => item.clientId === client.id)) {
      memberships.push({ clientId: client.id, role: 'admin' });
    }
  }

  return memberships;
}

export async function authorizeClientRequest(
  req: Request,
  options: {
    clientId?: string | null;
    shareId?: string | null;
    requirePortalEnabled?: boolean;
  },
): Promise<{ user: User; membership: ClientPortalMembership; clientId: string }> {
  const user = await getAuthUserFromRequest(req);
  if (!user) {
    throw new Error('Unauthorized');
  }

  const { membership, clientId } = await ensureClientPortalAccess({
    userId: user.id,
    clientId: options.clientId,
    shareId: options.shareId,
    requirePortalEnabled: options.requirePortalEnabled,
  });

  return { user, membership, clientId };
}

export function getClientPortalServiceClient() {
  return getServiceClient();
}
