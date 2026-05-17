import { signOutOwner } from '../actions';

export default function OwnerDashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-muted/40">
      <header className="bg-card flex items-center justify-between border-b px-6 py-3">
        <h1 className="text-base font-semibold">Mesa OS Lite — لوحة المالك</h1>
        <form action={signOutOwner}>
          <button
            type="submit"
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            خروج
          </button>
        </form>
      </header>
      <main className="mx-auto max-w-5xl p-6">{children}</main>
    </div>
  );
}
