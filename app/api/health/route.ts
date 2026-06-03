import { NextResponse } from 'next/server';

// Liveness probe for Coolify / the Docker HEALTHCHECK. Deliberately does NOT
// touch Supabase or R2: this answers "is the Node process up and serving?",
// not "are all dependencies healthy". A readiness check that hit the DB would
// let a transient Supabase blip mark the container unhealthy and trigger a
// restart loop while the app itself is fine. Keep it cheap and always-on.
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    { status: 'ok' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
