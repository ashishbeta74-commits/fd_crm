'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ContactForm } from '@/components/contacts/contact-form';
import { useCreateContact, useUpdateContact } from '@/hooks/use-contact-mutations';

/**
 * Create (no `contact`) or edit (`contact` given) a contact in a dialog.
 * onSaved(doc) is called with the saved contact.
 */
const NONE = '__none__';

/** "Add to list / sheet tab" for a new contact: the imported lists and their tabs (GET /sheets/targets). */
function ListPicker({ value, onChange }) {
  const { data } = useQuery({ queryKey: ['sheets', 'targets'], queryFn: api.sheets.targets, staleTime: 5 * 60_000 });
  const items = data?.items || [];
  if (!items.length) return null;
  const list = items.find((i) => i.listName === value.sheetName);
  return (
    <div className="grid gap-3 rounded-md border bg-muted/40 p-3 sm:grid-cols-2">
      <div className="grid gap-1.5">
        <Label htmlFor="cd-list" className="text-xs text-muted-foreground">
          Add to list
        </Label>
        <Select value={value.sheetName || NONE} onValueChange={(v) => onChange(v === NONE ? { sheetName: '', tabName: '' } : { sheetName: v, tabName: items.find((i) => i.listName === v)?.tabs[0] || '' })}>
          <SelectTrigger id="cd-list" className="w-full bg-background">
            <SelectValue placeholder="No list" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>No list (CRM only)</SelectItem>
            {items.map((i) => (
              <SelectItem key={i.listName} value={i.listName}>
                {i.listName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="cd-tab" className="text-xs text-muted-foreground">
          Sheet tab
        </Label>
        <Select value={value.tabName || NONE} onValueChange={(v) => onChange({ ...value, tabName: v === NONE ? '' : v })} disabled={!list}>
          <SelectTrigger id="cd-tab" className="w-full bg-background">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>—</SelectItem>
            {(list?.tabs || []).map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground sm:col-span-2">{data?.canWrite ? 'The contact is filed under this list and appended to that tab of the Google Sheet.' : 'The contact is filed under this list. Writing it into the Google Sheet needs the Google service account on the API host.'}</p>
    </div>
  );
}

export function ContactDialog({ open, onOpenChange, contact, onSaved }) {
  const create = useCreateContact();
  const update = useUpdateContact();
  const [duplicate, setDuplicate] = useState(null); // { existing, payload }
  const [source, setSource] = useState({ sheetName: '', tabName: '' });
  const editing = Boolean(contact?._id);
  const submitting = create.isPending || update.isPending;

  const close = () => {
    setDuplicate(null);
    onOpenChange(false);
  };

  const submit = async (payload, allowDuplicate = false) => {
    try {
      let doc;
      if (editing) {
        doc = await update.mutateAsync({ id: contact._id, data: payload });
        toast.success('Contact updated');
      } else {
        const body = { ...payload, ...(allowDuplicate ? { allowDuplicate: true } : {}), ...(source.sheetName ? { source } : {}) };
        doc = await create.mutateAsync(body);
        const w = doc.sheetWrite;
        if (w?.ok) toast.success(`Contact created and written to the "${w.tab}" tab of the ${source.sheetName} sheet (row ${w.rowNumber})`);
        else if (w) toast.warning(`Contact created in list ${source.sheetName}, but not written to the sheet`, { description: w.error, duration: 8000 });
        else toast.success('Contact created');
      }
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
          <>
            {editing ? null : <ListPicker value={source} onChange={setSource} />}
            <ContactForm
              key={contact?._id || 'new'}
            initial={contact}
            onSubmit={(payload) => submit(payload)}
            onCancel={close}
            submitting={submitting}
            submitLabel={editing ? 'Save changes' : 'Create contact'}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
