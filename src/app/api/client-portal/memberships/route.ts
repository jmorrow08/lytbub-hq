import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { getAuthUserFromRequest, getClientPortalServiceClient } from '@/lib/auth/client-auth';

type MembershipResponse = {
  id: string;
  name: string;
  companyName: string | null;
  role: 'viewer' | 'admin';
  portalEnabled: boolean;
};

export async function GET(req: Request) {
  let user: User | null = null;
  try {
    user = await getAuthUserFromRequest(req);
  } catch (error) {
    console.error('[client-portal memberships] Supabase configuration error', error);
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
  }

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let serviceClient;
  try {
    serviceClient = getClientPortalServiceClient();
  } catch (error) {
    console.error('[client-portal memberships] Supabase configuration error', error);
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
  }

  const { data: membershipRows, error: membershipError } = await serviceClient
    .from('client_users')
    .select(`client_id, role, client:clients(id, name, company_name, client_portal_enabled)`)
    .eq('user_id', user.id)
    .order('client_id', { ascending: true });

  if (membershipError) {
    console.error('[client-portal memberships] Failed to load membership rows', membershipError);
    return NextResponse.json({ error: 'Unable to load client memberships.' }, { status: 500 });
  }

  const responseMap = new Map<string, MembershipResponse>();

  for (const row of membershipRows ?? []) {
    const client = Array.isArray(row.client) ? row.client[0] : row.client;
    if (!client) continue;
    responseMap.set(client.id, {
      id: client.id,
      name: client.name ?? 'Client',
      companyName: client.company_name ?? null,
      role: row.role === 'admin' ? 'admin' : 'viewer',
      portalEnabled: client.client_portal_enabled !== false,
    });
  }

  const { data: ownedRows, error: ownedError } = await serviceClient
    .from('clients')
    .select('id, name, company_name, client_portal_enabled')
    .eq('created_by', user.id);

  if (ownedError) {
    console.error('[client-portal memberships] Failed to load owned clients', ownedError);
    return NextResponse.json({ error: 'Unable to load client memberships.' }, { status: 500 });
  }

  for (const client of ownedRows ?? []) {
    if (!responseMap.has(client.id)) {
      responseMap.set(client.id, {
        id: client.id,
        name: client.name ?? 'Client',
        companyName: client.company_name ?? null,
        role: 'admin',
        portalEnabled: client.client_portal_enabled !== false,
      });
    } else {
      const existing = responseMap.get(client.id);
      if (existing && existing.role !== 'admin') {
        responseMap.set(client.id, {
          ...existing,
          role: 'admin',
          portalEnabled: client.client_portal_enabled !== false,
        });
      }
    }
  }

  return NextResponse.json({ clients: Array.from(responseMap.values()) });
}
