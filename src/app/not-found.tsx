import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-6xl font-extrabold text-green-600">404</p>
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="max-w-md text-muted-foreground">The page you are looking for does not exist or you do not have access to it.</p>
      <div className="flex gap-2">
        <Button asChild><Link href="/dashboard">Go to dashboard</Link></Button>
        <Button asChild variant="outline"><Link href="/">Home</Link></Button>
      </div>
    </main>
  );
}
