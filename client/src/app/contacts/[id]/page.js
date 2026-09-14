'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CircleAlert, RefreshCw } from 'lucide-react';
import { api, qk } from '@/lib/api';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ContactDetail } from '@/components/contacts/detail/contact-detail';
import { BackLink } from '@/components/contacts/detail/detail-header';
import { DetailSkeleton } from '@/components/contacts/detail/detail-skeleton';
import { cn } from '@/lib/utils';

const FADE_IN = 'motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300';

export default function ContactPage() {
  const { id } = useParams();
  const { data, error, isError, isPending, isFetching, refetch } = useQuery({
    queryKey: qk.contact(id),
    queryFn: () => api.contacts.get(id),
    retry: (n, err) => err?.status !== 404 && n < 1,
  });
  const notFound = error?.status === 404;

  // A failed refetch keeps the last good document, so show it with a notice instead of dropping the page.
  // Keyed by id so editors and dialogs reset when navigating between contacts.
  if (data && !notFound) {
    return (
      <ContactDetail
        key={data._id}
        contact={data}
        notice={isError ? <LoadError error={error} onRetry={refetch} retrying={isFetching} className="mb-6" /> : null}
      />
    );
  }
  if (notFound) return <NotFound />;
  if (isPending) return <DetailSkeleton />;
  return (
    <div className={cn('mx-auto grid max-w-6xl gap-4', FADE_IN)}>
      <BackLink />
      <LoadError error={error} onRetry={refetch} retrying={isFetching} />
    </div>
  );
}

function LoadError({ error, onRetry, retrying, className }) {
  return (
    <Alert variant="destructive" className={cn(FADE_IN, className)}>
      <CircleAlert />
      <AlertTitle>Could not load this contact</AlertTitle>
      <AlertDescription>
        <p>{error?.message || 'Something went wrong'}</p>
        <Button size="sm" variant="outline" className="h-9 sm:h-8" onClick={() => onRetry()} disabled={retrying}>
          <RefreshCw className={retrying ? 'animate-spin' : undefined} aria-hidden="true" />
          {retrying ? 'Retrying…' : 'Retry'}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function NotFound() {
  return (
    <div className={cn('mx-auto grid max-w-6xl gap-4', FADE_IN)}>
      <BackLink />
      {/* Centred in the viewport and full-width on phones so it reads well at 400px. */}
      <div className="flex min-h-[50vh] items-center justify-center">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <p className="text-sm font-medium text-muted-foreground">404</p>
            <CardTitle className="text-xl">Contact not found</CardTitle>
            <CardDescription className="text-balance">It may have been deleted, or the link is wrong.</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button asChild variant="outline">
              <Link href="/contacts">
                <ArrowLeft /> Back to contacts
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
