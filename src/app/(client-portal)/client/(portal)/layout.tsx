import type { ReactNode } from 'react';
import { ClientPortalShell } from '@/components/client-portal/ClientPortalShell';

export default function ClientPortalLayout({ children }: { children: ReactNode }) {
  return <ClientPortalShell>{children}</ClientPortalShell>;
}
