'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { isoDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCreateRow, useUpdateRow } from '@/components/email-evaluation/use-email-evaluation';

// The sheet's columns, in the sheet's order (the second STATUS column is not part of the CRM).
const FIELDS = [
  { key: 'date', label: 'Date', type: 'date' },
  { key: 'evaluatedFor', label: 'Date evaluated for', placeholder: '2026', hint: 'The year (or date) the evaluation is for' },
  { key: 'clientName', label: 'Client name', placeholder: 'Lucy Hastings', autoFocus: true },
  { key: 'company', label: 'Company name', placeholder: 'HSBC Holdings PLC' },
  { key: 'status', label: 'Status', placeholder: 'Sent 03/09' },
  { key: 'primaryEmail', label: 'Primary email', type: 'email', placeholder: 'name@company.com' },
  { key: 'secondaryEmail', label: 'Secondary email', placeholder: 'other@company.com' },
  { key: 'phone', label: 'Phone no', type: 'tel', placeholder: '+1 212 555 0100' },
  { key: 'followUp', label: 'Follow up', placeholder: 'VIA EMAIL' },
  { key: 'followUpDate', label: 'Date of follow up', placeholder: '4th ReSent 30/09' },
  { key: 'notes', label: 'Notes', textarea: true, placeholder: 'Booked with us on 01/29/2026' },
];

const blank = (item) => Object.fromEntries(FIELDS.map((f) => [f.key, f.key === 'date' ? isoDate(item?.date) : item?.[f.key] || '']));

/** Add a row / edit every field of one (the table edits the most-used cells inline). */
export function EmailEvaluationDialog({ open, onOpenChange, item }) {
  const create = useCreateRow();
  const update = useUpdateRow();
  const editing = Boolean(item?._id);
  const [form, setForm] = useState(() => blank(item));
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const pending = create.isPending || update.isPending;
  const canSave = Boolean(form.clientName.trim() || form.company.trim() || form.primaryEmail.trim());

  const submit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()]));
    try {
      if (editing) await update.mutateAsync({ id: item._id, data });
      else await create.mutateAsync(data);
      toast.success(editing ? 'Row saved' : 'Row added');
      onOpenChange(false);
    } catch {
      /* toasted by the mutation */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${item.clientName || item.company || 'row'}` : 'New email evaluation'}</DialogTitle>
            <DialogDescription>{editing ? (item.tab ? `From the "${item.tab}" tab of the sheet. A change here stays until the same cell changes in the sheet.` : 'Added in the CRM (not in the sheet).') : 'Rows added here live in the CRM only; the sheet is not changed.'}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.key} className={f.textarea ? 'grid gap-1.5 sm:col-span-2' : 'grid gap-1.5'}>
                <Label htmlFor={`ee-${f.key}`}>{f.label}</Label>
                {f.textarea ? (
                  <Textarea id={`ee-${f.key}`} value={form[f.key]} onChange={set(f.key)} rows={4} placeholder={f.placeholder} maxLength={5000} />
                ) : (
                  <Input id={`ee-${f.key}`} type={f.type || 'text'} value={form[f.key]} onChange={set(f.key)} placeholder={f.placeholder} maxLength={300} autoFocus={f.autoFocus && !editing} />
                )}
                {f.hint ? <p className="text-xs text-muted-foreground">{f.hint}</p> : null}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !canSave}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {editing ? 'Save' : 'Add row'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
