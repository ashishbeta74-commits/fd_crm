'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useUpdateContact } from '@/hooks/use-contact-mutations';
import { DetailCard, TOUCH_SM } from './detail-card';

export function NotesCard({ contact }) {
  const saved = contact.notes || '';
  // Remount the editor whenever the stored notes change so a stale draft never lingers.
  return (
    <DetailCard title="Notes">
      <NotesEditor key={saved} contactId={contact._id} saved={saved} />
    </DetailCard>
  );
}

function NotesEditor({ contactId, saved }) {
  const update = useUpdateContact();
  const [value, setValue] = useState(saved);
  const dirty = value !== saved;

  // Errors are toasted by the mutation hook.
  const submit = (e) => {
    e.preventDefault();
    update.mutate({ id: contactId, data: { notes: value } }, { onSuccess: () => toast.success('Notes saved') });
  };

  return (
    <form onSubmit={submit} className="grid gap-3">
      <Label htmlFor="contact-notes" className="sr-only">
        Notes
      </Label>
      <Textarea id="contact-notes" rows={5} value={value} onChange={(e) => setValue(e.target.value)} placeholder="Notes about this contact…" />
      <div className="flex justify-end gap-2">
        {dirty ? (
          <Button type="button" size="sm" variant="ghost" className={TOUCH_SM} onClick={() => setValue(saved)} disabled={update.isPending}>
            Discard
          </Button>
        ) : null}
        <Button type="submit" size="sm" className={TOUCH_SM} disabled={!dirty || update.isPending}>
          {update.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {update.isPending ? 'Saving…' : 'Save notes'}
        </Button>
      </div>
    </form>
  );
}
