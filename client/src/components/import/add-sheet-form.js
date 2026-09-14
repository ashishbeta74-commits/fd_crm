'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, qk } from '@/lib/api';

const EMPTY = { name: '', date: '', url: '' };

/**
 * Save a calling sheet (name, date, Google Sheets link) in the database without importing it.
 * Saving a link that is already in the list updates its name / date instead of adding a row.
 */
export function AddSheetForm({ initial, onSaved }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(initial ? { ...EMPTY, ...initial } : EMPTY);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = useMutation({
    mutationFn: (body) => api.sheets.save(body),
    onSuccess: (item) => {
      qc.invalidateQueries({ queryKey: qk.importSources });
      toast.success(`Saved "${item.name || 'sheet'}"${item.dateLabel ? ` (${item.dateLabel})` : ''}`);
      setForm(EMPTY);
      onSaved?.(item);
    },
    onError: (err) => toast.error(err?.message || 'Could not save the sheet'),
  });

  const submit = (e) => {
    e.preventDefault();
    if (!form.url.trim()) return toast.error('Paste the Google Sheets link');
    save.mutate({ name: form.name.trim(), date: form.date.trim(), url: form.url.trim() });
  };

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_10rem_2fr_auto] sm:items-end" aria-label="Add a sheet to the list">
      <div className="grid gap-1.5">
        <Label htmlFor="sheet-name">Sheet name</Label>
        <Input id="sheet-name" value={form.name} onChange={set('name')} placeholder="Travel Advisors" autoComplete="off" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="sheet-date">Date</Label>
        <Input id="sheet-date" value={form.date} onChange={set('date')} placeholder="August 24,2026" autoComplete="off" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="sheet-url">Google Sheets link</Label>
        <Input id="sheet-url" value={form.url} onChange={set('url')} placeholder="https://docs.google.com/spreadsheets/d/..." inputMode="url" autoComplete="off" required />
      </div>
      <Button type="submit" disabled={save.isPending} aria-busy={save.isPending}>
        {save.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
        {initial ? 'Save' : 'Add sheet'}
      </Button>
    </form>
  );
}
