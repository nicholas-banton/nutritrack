'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Camera, History, BarChart3, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', label: 'Today', icon: LayoutDashboard },
  { href: '/log', label: 'Log Food', icon: Camera },
  { href: '/history', label: 'History', icon: History },
  { href: '/report', label: 'Report', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-t">
      <div className="max-w-lg mx-auto flex items-center justify-around h-16 px-4">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link key={href} href={href}
              className={cn('flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-colors',
                active ? 'text-teal-600' : 'text-gray-400 hover:text-gray-600')}>
              <Icon className={cn('h-5 w-5', active && 'stroke-[2.5]')} />
              <span className="text-xs font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
