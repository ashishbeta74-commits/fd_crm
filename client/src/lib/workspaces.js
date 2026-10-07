import { Car, ClipboardList, TrafficCone } from 'lucide-react';

// Sheet workspaces shown in the sidebar. The key must match an entry in server/src/workspaces.js;
// the page at /<href> renders <WorkspaceView workspace={key} /> and everything else comes from the API.
export const WORKSPACE_NAV = [
  { key: 'enquiries', href: '/enquiries', label: 'Daily Enquiries', icon: ClipboardList, accent: 'text-amber-600 dark:text-amber-400' },
  { key: 'violations', href: '/violations', label: 'Vehicle Violations', icon: TrafficCone, accent: 'text-orange-600 dark:text-orange-400' },
  { key: 'vehicles', href: '/vehicles', label: 'Vehicles', icon: Car, accent: 'text-sky-700 dark:text-sky-400' },
];
