// Tab definitions shared by the follow-ups view and its loading skeleton.

export const PAGE_DESCRIPTION = 'Every follow-up date, booking and reminder across your contacts, grouped by when it is due - most urgent first within a day.';

export const TABS = [
  { key: 'overdue', label: 'Overdue', empty: 'Nothing overdue - nice.' },
  { key: 'today', label: 'Today', empty: 'Nothing due today.' },
  { key: 'week', label: 'This week', empty: 'Nothing due in the next 7 days.' },
  { key: 'later', label: 'Later', empty: 'Nothing scheduled further out.' },
  { key: 'past', label: 'Past bookings', empty: 'No past bookings yet.' },
];

export const TAB_KEYS = TABS.map((t) => t.key);

/** Tab to show when the URL has no ?tab=: the first bucket that needs attention. */
export function defaultTab(data) {
  if (data?.overdue?.length) return 'overdue';
  if (data?.today?.length) return 'today';
  return 'week';
}
