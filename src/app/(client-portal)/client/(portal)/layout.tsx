import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { ClientPortalShell } from '@/components/client-portal/ClientPortalShell';

export default function ClientPortalLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <ClientPortalShell>{children}</ClientPortalShell>
    </Suspense>
  );
}
