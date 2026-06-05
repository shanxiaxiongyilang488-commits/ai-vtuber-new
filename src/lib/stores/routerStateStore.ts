import { writable } from 'svelte/store';
import type { IntentResult } from '../intentRouter';

export const routerStateStore = writable<IntentResult | null>(null);
