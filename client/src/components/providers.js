'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/components/auth/auth-provider';
import { isLive } from '@/lib/live';

export function Providers({ children }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // 401 = signed out; retrying would only delay the sign-in screen.
          // Ten people work the same data. With live updates on (lib/live.js) changes arrive by themselves, so
          // regaining focus refetches nothing; without them a tab refreshes on focus / reconnect and pages poll (LIVE_MS).
          queries: { staleTime: 10_000, retry: (count, err) => err?.status !== 401 && count < 1, refetchOnWindowFocus: () => !isLive(), refetchOnReconnect: true },
        },
      }),
  );
  return (
    // Light / dark / system via the `dark` class on <html> (see globals.css); the choice is kept in localStorage.
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={client}>
        <AuthProvider>
          <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        </AuthProvider>
        <Toaster richColors position="top-right" closeButton />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
