import { ClipboardList } from 'lucide-react';

// Sheet workspaces shown in the sidebar. The key must match an entry in server/src/workspaces.js;
// the page at /<href> renders <WorkspaceView workspace={key} /> and everything else comes from the API.
export const WORKSPACE_NAV = [
  { key: 'enquiries', href: '/enquiries', label: 'Daily Enquiries', icon: ClipboardList, accent: 'text-amber-600 dark:text-amber-400' },
];
