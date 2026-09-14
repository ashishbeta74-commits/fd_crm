// Tiny in-process event bus. Models emit here ('contact:saved') and services subscribe,
// which keeps models free of service imports (no circular dependencies).
import { EventEmitter } from 'node:events';

export const events = new EventEmitter();
events.setMaxListeners(20);
