import { Cormorant, Geist_Mono, Outfit } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
import { AppShell } from '@/components/app-shell';

// Same faces as famousdrive.com: Outfit for text, Cormorant for headings.
const outfit = Outfit({ variable: '--font-outfit', subsets: ['latin'] });
const cormorant = Cormorant({ variable: '--font-cormorant', subsets: ['latin'], weight: ['400', '500', '600', '700'], style: ['normal', 'italic'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata = {
  title: { default: 'Famous Drive CRM', template: '%s | Famous Drive CRM' },
  description: 'Famous Drive outreach CRM - contacts, follow-ups and bookings',
  icons: { icon: '/images/fd-monogram.png', apple: '/images/fd-monogram.png' },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${outfit.variable} ${cormorant.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full font-sans">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
