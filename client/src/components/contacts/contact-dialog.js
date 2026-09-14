'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ContactForm } from '@/components/contacts/contact-form';
import { useCreateContact, useUpdateContact } from '@/hooks/use-contact-mutations';

/**
 * Create (no `contact`) or edit (`contact` given) a contact in a dialog.
 * onSaved(doc) is called with the saved contact.
 */
export function ContactDialog({ open, onOpenChange, contact, onSaved }) {
  const create = useCreateContact();
  const update = useUpdateContact();
  const [duplicate, setDuplicate] = useState(null); // { existing, payload }
  const editing = Boolean(contact?._id);
  const submitting = create.isPending || update.isPending;

  const close = () => {
    setDuplicate(null);
    onOpenChange(false);
  };

  const submit = async (payload, allowDuplicate = false) => {
    try {
      let doc;
      if (editing) doc = await update.mutateAsync({ id: contact._id, data: payload });
      else doc = await create.mutateAsync(allowDuplicate ? { ...payload, allowDuplicate: true } : payload);
      toast.success(editing ? 'Contact updated' : 'Contact created');
      close();
      onSaved?.(doc);
    } catch (err) {
      if (err?.status === 409 && err.details?.existing) {
        setDuplicate({ existing: err.details.existing, payload });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit contact' : 'Add contact'}</DialogTitle>
          <DialogDescription className="wrap-break-word">
            {editing ? contact.name || contact.email || 'Update the details below.' : 'Create a contact manually.'}
          </DialogDescription>
        </DialogHeader>

        {duplicate ? (
          <div className="min-w-0 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-200 dark:border-amber-900 dark:bg-amber-950/30">
            <p className="font-medium">A contact with the same email (or name + company) already exists.</p>
            <p className="mt-1 text-muted-foreground wrap-break-word">
              {duplicate.existing.name || '(no name)'} {duplicate.existing.email ? `· ${duplicate.existing.email}` : ''}{' '}
              {duplicate.existing.companyName ? `· ${duplicate.existing.companyName}` : ''}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href={`/contacts/${duplicate.existing._id}`} onClick={close}>
                  Open existing
                </Link>
              </Button>
              <Button size="sm" variant="secondary" onClick={() => submit(duplicate.payload, true)} disabled={submitting} aria-busy={submitting || undefined}>
                {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                {submitting ? 'Creating…' : 'Create anyway'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDuplicate(null)} disabled={submitting}>
                Back to form
              </Button>
            </div>
          </div>
        ) : (
          <ContactForm
            key={contact?._id || 'new'}
            initial={contact}
            onSubmit={(payload) => submit(payload)}
            onCancel={close}
            submitting={submitting}
            submitLabel={editing ? 'Save changes' : 'Create contact'}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
