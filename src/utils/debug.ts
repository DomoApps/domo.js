export type DebugCategory = 'http' | 'messages' | 'auth' | 'filters' | 'variables' | 'all';

const STORAGE_KEY = '__domo_debug__';

export interface DomoDebug {
  enabled: boolean;
  categories: Set<DebugCategory>;
  enable(categories?: DebugCategory[]): void;
  disable(): void;
  log(category: DebugCategory, ...args: any[]): void;
}

function createDomoDebug(): DomoDebug {
  const debug: DomoDebug = {
    enabled: false,
    categories: new Set<DebugCategory>(['all']),

    enable(categories?: DebugCategory[]) {
      debug.enabled = true;
      debug.categories = new Set(categories || ['all']);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...debug.categories]));
      } catch {}
    },

    disable() {
      debug.enabled = false;
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
    },

    log(category: DebugCategory, ...args: any[]) {
      if (!debug.enabled) return;
      if (!debug.categories.has('all') && !debug.categories.has(category)) return;
      console.debug(`[domo:${category}]`, ...args);
    },
  };

  // Auto-enable from localStorage
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const categories = JSON.parse(stored) as DebugCategory[];
      debug.enabled = true;
      debug.categories = new Set(categories);
    }
  } catch {}

  return debug;
}

export const domoDebug = createDomoDebug();
