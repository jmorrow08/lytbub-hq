import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { ClientPortalShell } from '@/components/client-portal/ClientPortalShell';
import { AuthProvider } from '@/components/auth/AuthProvider';

export default function ClientPortalLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <Suspense fallback={null}>
        <ClientPortalShell>{children}</ClientPortalShell>
      </Suspense>
    </AuthProvider>
  );
}
