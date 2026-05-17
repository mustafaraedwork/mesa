import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-bold tracking-tight">Mesa OS Lite</h1>
      <p className="text-muted-foreground max-w-md text-lg leading-8">
        منيو رقمي ذكي للمطاعم — يُعرض للزبون عبر رمز QR، ويُدار من لوحة تحكّم بسيطة.
      </p>
      <Link
        href="/admin"
        className="bg-primary text-primary-foreground rounded-lg px-6 py-3 font-medium"
      >
        دخول أصحاب المطاعم
      </Link>
    </main>
  );
}
