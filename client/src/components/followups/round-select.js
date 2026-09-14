'use client';

import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUpdateContact } from '@/hooks/use-contact-mutations';
import { cn } from '@/lib/utils';

// Follow-ups are numbered like the calling sheets (Follow Up 1, Follow Up 2 …). The dropdown shows the
// round the contact is on (rounds done + 1) and lets the team correct it; "Add follow-up" moves it on by one.
const MAX_ROUND = 12;

/** "Follow-up N" picker; saves `followUpCount = N - 1` on change. */
export function RoundSelect({ contact, className, size = 'sm' }) {
  const update = useUpdateContact();
  const round = (contact.followUpCount || 0) + 1;
  const options = Array.from({ length: Math.max(MAX_ROUND, round) }, (_, i) => i + 1);
  return (
    <Select
      value={String(round)}
      onValueChange={(v) => {
        const next = Number(v);
        if (next === round) return;
        update.mutate({ id: contact._id, data: { followUpCount: next - 1 } }, { onSuccess: () => toast.success(`${contact.name || 'Contact'}: now on follow-up ${next}`) });
      }}
      disabled={update.isPending}
    >
      <SelectTrigger size={size} className={cn('w-32 text-xs font-medium', className)} aria-label="Follow-up round">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((n) => (
          <SelectItem key={n} value={String(n)}>
            Follow-up {n}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
