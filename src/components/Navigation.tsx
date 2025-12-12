'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CheckSquare, Video, Heart, FolderKanban, CreditCard, UserCircle } from 'lucide-react';
import { useAuth } from './auth/AuthProvider';
import { Button } from './ui/button';
import { useUserFeatures } from './features/UserFeaturesProvider';
import type { FeatureFlag } from '@/lib/features';

const navigation: Array<{ name: string; href: string; icon: typeof CheckSquare; feature?: FeatureFlag }> = [
  { name: 'Dashboard', href: '/', icon: CheckSquare },
  { name: 'Projects', href: '/projects', icon: FolderKanban, feature: 'dashboard' },
  { name: 'Clients', href: '/clients', icon: UserCircle, feature: 'dashboard' },
  { name: 'Tasks', href: '/tasks', icon: CheckSquare, feature: 'tasks' },
  { name: 'Finance', href: '/finance', icon: CreditCard, feature: 'billing' },
  { name: 'Content', href: '/content', icon: Video, feature: 'dashboard' },
  { name: 'Health', href: '/health', icon: Heart, feature: 'dashboard' },
  { name: 'Users', href: '/users', icon: UserCircle, feature: 'admin' },
];

export function Navigation() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { features } = useUserFeatures();

  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center space-x-8">
            <Link href="/" className="text-xl font-bold">
              Lytbub HQ
            </Link>
            <div className="hidden md:flex space-x-6">
              {navigation
                .filter((item) => !item.feature || features.includes(item.feature))
                .map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {user && (
              <span className="hidden text-sm text-muted-foreground md:inline-flex">
                {user.email}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
