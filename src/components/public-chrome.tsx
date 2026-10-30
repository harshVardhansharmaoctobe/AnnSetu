import Link from 'next/link';
import { Leaf } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-30 border-b bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold">
          <span className="rounded-lg gradient-primary p-1.5"><Leaf className="h-5 w-5 text-white" /></span> FoodBridge
        </Link>
        <nav className="hidden gap-6 text-sm font-medium text-muted-foreground md:flex" aria-label="Main">
          <Link href="/#about" className="hover:text-foreground">About</Link>
          <Link href="/#how-it-works" className="hover:text-foreground">How it works</Link>
          <Link href="/#impact" className="hover:text-foreground">Impact</Link>
          <Link href="/#help" className="hover:text-foreground">Help</Link>
        </nav>
        <div className="flex gap-2">
          <Button asChild variant="ghost" size="sm"><Link href="/login">Sign in</Link></Button>
          <Button asChild size="sm"><Link href="/register">Join</Link></Button>
        </div>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:justify-between">
        <p>© {new Date().getFullYear()} FoodBridge – rescue food, reduce waste, feed communities.</p>
        <p>Hackathon MVP · impact figures are computed from live records</p>
      </div>
    </footer>
  );
}
