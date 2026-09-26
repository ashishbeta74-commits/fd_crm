'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, BellPlus, CalendarPlus, Linkedin, Mail, MoreHorizontal, Pencil, Phone, StickyNote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PriorityBadge, TagList } from '@/components/badges';
import { ReminderDialog } from '@/components/reminders/reminder-dialog';
import { SendEmailDialog } from '@/components/email/send-email-dialog';
import { AddFollowUpDialog } from '@/components/followups/add-followup-dialog';
import { ContactActionsMenu } from '@/components/contacts/contact-actions-menu';
import { ContactDialog } from '@/components/contacts/contact-dialog';
import { linkedInHref, linkedInLabel } from '@/components/contacts/list/linkedin-link';
import { LogCallDialog, NoteDialog } from '@/components/contacts/log-call-dialog';
import { StageSelect, useStageChange } from '@/components/contacts/stage-controls';
import { formatDateTime, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { StageBadgeTip } from './badge-tips';
import { TOUCH_SM } from './detail-card';

// Below `sm` the actions stretch to fill their row (36px tall); from `sm` they are compact and hug their text.
const ACTION = cn(TOUCH_SM, 'flex-1 sm:flex-none');

export function BackLink() {
  return (
    <Link href="/contacts" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
      <ArrowLeft className="size-4" aria-hidden="true" />
      Back to contacts
    </Link>
  );
}

export function DetailHeader({ contact }) {
  const router = useRouter();
  const { changeStage, stageDialog, pending } = useStageChange();
  const [dialog, setDialog] = useState(null); // 'call' | 'note' | 'edit'
  const closeDialog = (open) => !open && setDialog(null);
  const subtitle = [contact.title, contact.companyName].filter(Boolean).join(' · ');
  const linkedIn = linkedInHref(contact.contactL1);

  return (
    <div className="mb-6 grid gap-4">
      <BackLink />
      {/* Name, title / company and badges first; the action row wraps underneath until `lg`. */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight wrap-break-word">{contact.name || contact.email || 'Unnamed contact'}</h1>
          {subtitle ? <p className="mt-1 text-sm text-muted-foreground wrap-break-word">{subtitle}</p> : null}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StageBadgeTip stage={contact.stage} />
            <PriorityBadge priority={contact.priority} withTooltip />
            <TagList tags={contact.tags} max={6} />
          </div>
          {contact.updatedBy?.name ? (
            <p className="mt-2 text-xs text-muted-foreground" title={formatDateTime(contact.updatedBy.at)}>
              Last changed by <span className="font-medium text-foreground/80">{contact.updatedBy.name}</span> · {timeAgo(contact.updatedBy.at)}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">
          <Button size="sm" className={ACTION} onClick={() => setDialog('call')}>
            <Phone /> Log call
          </Button>
          <Button size="sm" variant="outline" className={ACTION} onClick={() => setDialog('followup')}>
            <CalendarPlus /> Add follow-up
          </Button>
          <Button size="sm" variant="outline" className={ACTION} onClick={() => setDialog('email')}>
            <Mail /> Email
          </Button>
          <Button size="sm" variant="outline" className={ACTION} onClick={() => setDialog('reminder')}>
            <BellPlus /> Remind me
          </Button>
          <Button size="sm" variant="outline" className={ACTION} onClick={() => setDialog('note')}>
            <StickyNote /> Add note
          </Button>
          <Button size="sm" variant="outline" className={ACTION} onClick={() => setDialog('edit')}>
            <Pencil /> Edit
          </Button>
          {linkedIn ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button asChild size="sm" variant="outline" className={ACTION}>
                  <a href={linkedIn} target="_blank" rel="noreferrer">
                    <Linkedin /> LinkedIn
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs break-all">{linkedInLabel(contact.contactL1)}</TooltipContent>
            </Tooltip>
          ) : null}
          {/* Failures are already toasted by the mutation hook; swallow the rejection so it is not reported as unhandled. */}
          <StageSelect
            value={contact.stage}
            onChange={(stage) => changeStage(contact, stage).catch(() => {})}
            disabled={pending}
            className="min-h-9 flex-1 sm:min-h-0 sm:flex-none"
          />
          {/* The menu owns its DropdownMenuTrigger, so the tooltip trigger is handed in as the `trigger` element. */}
          <Tooltip>
            <ContactActionsMenu
              contact={contact}
              showOpen={false}
              onDeleted={() => router.push('/contacts')}
              trigger={
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-sm" className="size-9 sm:size-8" aria-label="More actions">
                    <MoreHorizontal />
                  </Button>
                </TooltipTrigger>
              }
            />
            <TooltipContent>More actions</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {dialog === 'call' ? <LogCallDialog contact={contact} open onOpenChange={closeDialog} /> : null}
      {dialog === 'followup' ? <AddFollowUpDialog contact={contact} open onOpenChange={closeDialog} /> : null}
      {dialog === 'note' ? <NoteDialog contact={contact} open onOpenChange={closeDialog} onSaved={() => toast.success('Note added')} /> : null}
      {dialog === 'edit' ? <ContactDialog contact={contact} open onOpenChange={closeDialog} /> : null}
      {dialog === 'reminder' ? <ReminderDialog contact={contact} open onOpenChange={closeDialog} /> : null}
      {dialog === 'email' ? <SendEmailDialog contact={contact} open onOpenChange={closeDialog} /> : null}
      {stageDialog}
    </div>
  );
}
