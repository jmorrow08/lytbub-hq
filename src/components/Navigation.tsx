'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CheckSquare, DollarSign, Video, Heart } from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/', icon: CheckSquare },
  { name: 'Tasks', href: '/tasks', icon: CheckSquare },
  { name: 'Revenue', href: '/revenue', icon: DollarSign },
  { name: 'Content', href: '/content', icon: Video },
  { name: 'Health', href: '/health', icon: Heart },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center space-x-8">
            <Link href="/" className="text-xl font-bold">
              Lytbub HQ
            </Link>
            <div className="hidden md:flex space-x-6">
              {navigation.map((item) => {
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
        </div>
      </div>
    </nav>
  );
}
