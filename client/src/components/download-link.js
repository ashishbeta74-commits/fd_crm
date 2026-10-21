'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { downloadFile } from '@/lib/api';

/** An export link that works while signed in (see downloadFile); use with <Button asChild>. */
export function DownloadLink({ href, children, ...props }) {
  const [busy, setBusy] = useState(false);
  const onClick = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const t = toast.loading('Preparing the file…');
    try {
      await downloadFile(href);
      toast.success('Downloaded', { id: t });
    } catch (err) {
      toast.error(err?.message || 'Download failed', { id: t });
    } finally {
      setBusy(false);
    }
  };
  return (
    <a href={href} download onClick={onClick} aria-busy={busy || undefined} {...props}>
      {children}
    </a>
  );
}
