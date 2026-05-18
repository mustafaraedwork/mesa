import { redirect } from 'next/navigation';
import { getRestaurantIdFromCookie } from '@/lib/auth/session';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export default async function TenantLoginPage() {
  // Already signed in? Skip the form.
  const id = await getRestaurantIdFromCookie();
  if (id) redirect('/admin/dashboard');

  return (
    <main className="bg-muted/40 flex min-h-screen items-center justify-center p-6">
      <div className="bg-card border-border-lite shadow-card w-full max-w-sm space-y-6 rounded-xl border p-6">
        <header className="space-y-1 text-center">
          <h1 className="text-xl font-semibold">دخول المطعم</h1>
          <p className="text-muted-foreground text-sm">
            استخدم بيانات الدخول التي زوّدك بها المالك
          </p>
        </header>
        <LoginForm />
      </div>
    </main>
  );
}
