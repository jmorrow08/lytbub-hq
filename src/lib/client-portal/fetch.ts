'use client';

import { supabase } from '@/lib/supabaseClient';

type PortalFetchOptions = RequestInit & {
  parseJson?: boolean;
};

export async function portalFetch(path: string, options: PortalFetchOptions = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const token = session?.access_token;
  if (!token) {
    throw new Error('You need to sign in to continue.');
  }

  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
    cache: options.cache ?? 'no-store',
  });

  if (options.parseJson === false) {
    return response;
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error || 'Unable to complete request.';
    throw new Error(message);
  }
  return payload;
}







