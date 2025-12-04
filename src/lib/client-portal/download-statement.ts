'use client';

import { supabase } from '@/lib/supabaseClient';

type DownloadType = 'csv' | 'pdf';

function extractFilename(disposition: string | null, fallback: string) {
  if (!disposition) {
    return fallback;
  }
  const match = /filename="?(?<filename>[^"]+)"?/i.exec(disposition);
  if (match?.groups?.filename) {
    return match.groups.filename;
  }
  return fallback;
}

async function getAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}

export async function downloadStatement(invoiceId: string, type: DownloadType) {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('You need to sign in to download statements.');
  }

  const url = `/api/client-portal/statements/${invoiceId}/download?type=${type}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Client-Portal-Download': '1',
    },
    redirect: 'follow',
  });

  if (type === 'pdf') {
    const payload = await response.json().catch(() => null);
    if (response.ok && payload?.url) {
      window.open(payload.url, '_blank', 'noopener');
      return;
    }
    const message =
      payload?.error ??
      (response.ok ? 'Unable to generate download link.' : 'Unable to download statement.');
    throw new Error(message);
  }

  if (response.ok) {
    const blob = await response.blob();
    const filename = extractFilename(
      response.headers.get('Content-Disposition'),
      `invoice-${invoiceId}.${type}`,
    );
    triggerDownload(blob, filename);
    return;
  }

  let message = 'Unable to download statement.';
  try {
    const payload = await response.json();
    if (payload?.error) {
      message = payload.error;
    }
  } catch {
    // ignore JSON parse failure
  }
  throw new Error(message);
}
