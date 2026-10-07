'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { isoDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCreateRow, useUpdateRow } from '@/components/workspace/use-workspace';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T/;
/** A stored value as text for an input: dates as YYYY-MM-DD, numbers as digits, anything else as is. */
export const valueText = (v) => (v == null ? '' : ISO_DATE.test(String(v)) ? isoDate(v) : String(v));
const NONE = '__none__';

/** Add a row / edit every field of one. Fields follow the workspace config. */
export function WorkspaceDialog({ workspace: ws, open, onOpenChange, item, options = {} }) {
  const create = useCreateRow(ws.key);
  const update = useUpdateRow(ws.key);
  const editing = Boolean(item?._id);
  const [form, setForm] = useState(() => Object.fromEntries(ws.fields.map((f) => [f.key, valueText(item?.values?.[f.key])])));
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const pending = create.isPending || update.isPending;
  const identifying = [ws.keyField, ...ws.fields.filter((f) => f.search).map((f) => f.key)].filter(Boolean);
  const canSave = identifying.some((k) => (form[k] || '').trim());
  const title = item?.values?.[ws.keyField] || item?.values?.clientName || ws.rowLabel;

  const submit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, String(v ?? '').trim()]));
    try {
      if (editing) await update.mutateAsync({ id: item._id, data });
      else await create.mutateAsync(data);
      toast.success(editing ? 'Saved' : `${ws.rowLabel[0].toUpperCase()}${ws.rowLabel.slice(1)} added`);
      onOpenChange(false);
    } catch {
      /* toasted by the mutation */
    }
  };

  // Enum choices: the config's options plus whatever the sheet already uses.
  const choices = (f) => [...new Set([...(f.options || []), ...(options[f.key] || []).map((o) => o.value).filter(Boolean), form[f.key]].filter(Boolean))];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-3xl">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${title}` : `New ${ws.rowLabel}`}</DialogTitle>
            <DialogDescription>{editing ? (item.tab ? `From the "${item.tab}" tab of the sheet. A change here stays until the same cell changes in the sheet.` : 'Added in the CRM (not in the sheet).') : 'Rows added here live in the CRM only; the sheet is not changed.'}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ws.fields.map((f) => {
              const id = `ws-${ws.key}-${f.key}`;
              const isDate = f.type === 'date' && (!form[f.key] || /^\d{4}-\d{2}-\d{2}$/.test(form[f.key]));
              return (
                <div key={f.key} className={f.type === 'long' ? 'grid gap-1.5 sm:col-span-2 lg:col-span-3' : 'grid gap-1.5'}>
                  <Label htmlFor={id}>{f.label}</Label>
                  {f.type === 'long' ? (
                    <Textarea id={id} value={form[f.key]} onChange={(e) => set(f.key, e.target.value)} rows={3} maxLength={5000} />
                  ) : f.type === 'enum' ? (
                    <Select value={form[f.key] || NONE} onValueChange={(v) => set(f.key, v === NONE ? '' : v)}>
                      <SelectTrigger id={id} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>—</SelectItem>
                        {choices(f).map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input id={id} type={isDate ? 'date' : f.type === 'number' ? 'number' : f.type === 'email' ? 'email' : 'text'} step={f.type === 'number' ? 'any' : undefined} value={form[f.key]} onChange={(e) => set(f.key, e.target.value)} maxLength={500} autoFocus={!editing && f.key === identifying[0]} />
                  )}
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !canSave}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {editing ? 'Save' : `Add ${ws.rowLabel}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
