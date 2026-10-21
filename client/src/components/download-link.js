'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { downloadFile } from '@/lib/api';

/** An export link that works while signed in (see downloadFile); use with <Button asChild>. */
export function DownloadLink({ href, children, onClick: parentClick, ...props }) {
  const [busy, setBusy] = useState(false);
  // Tooltip / Button asChild pass their own onClick: run it too, but never let it replace this one.
  const onClick = async (e) => {
    parentClick?.(e);
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
    <a {...props} href={href} download onClick={onClick} aria-busy={busy || undefined}>
      {children}
    </a>
  );
}
