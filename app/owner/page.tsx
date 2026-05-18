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
      <div className="border-border-lite bg-card shadow-card w-full max-w-sm space-y-6 rounded-xl border p-6">
        <header className="space-y-1 text-center">
          <h1 className="text-xl font-semibold">Mesa OS Lite — لوحة المالك</h1>
          <p className="text-muted-foreground text-sm">سجّل الدخول لإدارة الحسابات</p>
        </header>
        <LoginForm />
      </div>
    </main>
  );
}
