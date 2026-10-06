import { Suspense } from 'react';
import { PageHeader } from '@/components/page-header';
import { EmailEvaluationView, EmailEvaluationViewFallback } from '@/components/email-evaluation/email-evaluation-view';

export const metadata = { title: 'Email Evaluation' };

export default function EmailEvaluationPage() {
  return (
    <>
      <PageHeader title="Email Evaluation" description="Every client evaluated by email, straight from the team's EMAIL EVALUATION sheet: date, who it is for, company, status, emails, phone, notes and the follow-up. Edit here; the sheet is re-read on sync." />
      <Suspense fallback={<EmailEvaluationViewFallback />}>
        <EmailEvaluationView />
      </Suspense>
    </>
  );
}
