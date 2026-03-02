import AuthGuard from '@/components/auth/AuthGuard';
import BottomNav from '@/components/layout/bottom-nav';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <main className="max-w-lg mx-auto px-4 pt-6 pb-24">
          {children}
        </main>
        <BottomNav />
      </div>
    </AuthGuard>
  );
}
