import type { ReactNode } from 'react';
import { AppFrame } from '@/components/AppFrame';
import { AuthProvider } from '@/components/auth/AuthProvider';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AppFrame>{children}</AppFrame>
    </AuthProvider>
  );
}
