import Link from 'next/link';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="max-w-md text-sm text-muted-foreground">The page you are looking for does not exist or has moved.</p>
      <Button asChild className="mt-2">
        <Link href="/">Back to dashboard</Link>
      </Button>
    </div>
  );
}
