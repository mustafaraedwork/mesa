import { redirect } from 'next/navigation';
import { getAuthServerClient } from '@/lib/supabase/auth-server';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export default async function OwnerLoginPage() {
  // If already signed in as owner, skip the form.
  const supabase = await getAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.app_metadata?.role === 'owner') {
    redirect('/owner/dashboard');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <div className="border-border-lite bg-card shadow-card w-full max-w-sm space-y-6 rounded-2xl border p-6">
        <header className="flex flex-col items-center gap-3 text-center">
          <span className="bg-primary text-primary-foreground shadow-cta flex size-12 items-center justify-center rounded-2xl text-xl font-semibold">
            M
          </span>
          <div className="space-y-1">
            <h1 className="text-h3 font-semibold">Mesa OS Lite</h1>
            <p className="text-muted-foreground text-sm">لوحة المالك — سجّل الدخول لإدارة الحسابات</p>
          </div>
        </header>
        <LoginForm />
      </div>
    </main>
  );
}
