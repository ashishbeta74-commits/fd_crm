import { LoadingScreen } from '@/components/loading-screen';

/** Shown by the App Router while a page's code and data are loading. */
export default function Loading() {
  return <LoadingScreen label="Loading…" hint="Getting the latest from the CRM" />;
}
