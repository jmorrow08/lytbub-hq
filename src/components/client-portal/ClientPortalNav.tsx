'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClientPortalMembership } from './ClientPortalShell';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ClientPortalNavProps = {
  memberships: ClientPortalMembership[];
  activeClientId: string;
  onSelectClient: (clientId: string) => void;
};

const NAV_ITEMS: Array<{ label: string; href: string }> = [
  { label: 'Overview', href: '/client/dashboard' },
  { label: 'Statements', href: '/client/statements' },
  { label: 'Usage', href: '/client/usage' },
];

export function ClientPortalNav({
  memberships,
  activeClientId,
  onSelectClient,
}: ClientPortalNavProps) {
  const pathname = usePathname();

  return (
    <aside className="w-full border-b border-slate-900/60 bg-slate-950/80 px-4 py-4 md:w-72 md:border-b-0 md:border-r">
      <div className="space-y-6">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Clients</div>
          <div className="mt-2 space-y-2">
            {memberships.map((membership) => {
              const isActive = membership.id === activeClientId;
              return (
                <button
                  key={membership.id}
                  type="button"
                  onClick={() => onSelectClient(membership.id)}
                  className={cn(
                    'w-full rounded-md px-3 py-2 text-left text-sm transition',
                    isActive
                      ? 'bg-primary/20 text-slate-50 shadow-sm'
                      : 'bg-transparent text-slate-300 hover:bg-primary/10 hover:text-slate-100',
                  )}
                >
                  <span className="block font-medium">{membership.name}</span>
                  {membership.companyName && (
                    <span className="block text-xs text-slate-400">{membership.companyName}</span>
                  )}
                  {membership.portalEnabled === false && (
                    <span className="block text-[10px] text-amber-400">Portal disabled</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Navigation</div>
          <nav className="mt-2 space-y-1">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Button
                  key={item.href}
                  asChild
                  variant={isActive ? 'secondary' : 'ghost'}
                  size="sm"
                  className={cn(
                    'w-full justify-start border border-transparent px-3 py-2 text-sm',
                    isActive
                      ? 'bg-primary/20 text-slate-50'
                      : 'text-slate-300 hover:text-slate-100',
                  )}
                >
                  <Link href={item.href}>{item.label}</Link>
                </Button>
              );
            })}
          </nav>
        </div>

        <div className="pt-2">
          <div className="text-xs uppercase tracking-wide text-slate-500">Workspace</div>
          <div className="mt-2 space-y-2">
            <Button asChild variant="outline" size="sm" className="w-full justify-start">
              <Link href="/">Back to dashboard</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="w-full justify-start text-slate-300 hover:text-slate-100">
              <Link href="/tasks">Go to tasks</Link>
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}





