import type { ConfigKey, ConfigKeyMap } from './configKeys';

type Subscriber = (value: unknown) => void;

declare global {
  interface Window {
    __backendPort?: number;
  }
}

/**
 * Bound the first `/api/settings/client` so a cold aioncore cannot leave
 * `initialize()` hanging forever. Agent Hub warming polls with short timeouts;
 * without this, the module-boot initPromise from `main.tsx` can still be stuck
 * when warming finishes, and `bootstrapRendererConfig` waits on it indefinitely.
 */
export const CONFIG_INITIALIZE_FETCH_TIMEOUT_MS = 12_000;

function getBaseUrl(): string {
  // WebUI browser mode: no preload, fetch same-origin so web-host's
  // static-server reverse-proxies /api/* to the backend.
  if (typeof window !== 'undefined' && typeof document !== 'undefined' && !(window as Window).__backendPort) {
    return '';
  }
  const port = typeof window !== 'undefined' ? (window as Window).__backendPort || 13400 : 13400;
  return `http://127.0.0.1:${port}`;
}

type FetchJsonOptions = {
  signal?: AbortSignal;
};

async function fetchJson<T>(method: string, path: string, body?: unknown, options?: FetchJsonOptions): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: options?.signal,
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`ConfigService ${method} ${path} failed (${response.status}): ${errorBody}`);
  }
  const contentType = response.headers.get('Content-Type');
  if (!contentType?.includes('application/json')) {
    return undefined as T;
  }
  const json = await response.json();
  if (json && typeof json === 'object' && 'data' in json) {
    return json.data as T;
  }
  return json as T;
}

class ConfigServiceImpl {
  private cache = new Map<string, unknown>();
  private subscribers = new Map<string, Set<Subscriber>>();
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private initGeneration = 0;

  // Idempotent: concurrent callers share the same in-flight promise, and a
  // resolved init returns immediately. Modules that need persisted settings on
  // module load (theme/colorScheme/language) await whenReady() before reading.
  initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    const generation = ++this.initGeneration;
    this.initPromise = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), CONFIG_INITIALIZE_FETCH_TIMEOUT_MS);
      try {
        const data = await fetchJson<Record<string, unknown>>('GET', '/api/settings/client', undefined, {
          signal: controller.signal,
        });
        // A newer initialize() abandoned this generation (e.g. after warming).
        if (generation !== this.initGeneration) return;
        this.cache.clear();
        if (data) {
          for (const [key, value] of Object.entries(data)) {
            this.cache.set(key, value);
          }
        }
        // One-time theme migration: only when new keys are absent (idempotent).
        if (!this.cache.has('theme.activeId')) {
          const { migrateThemeConfig } = await import('@/common/theme/migrateThemeConfig');
          const migrated = migrateThemeConfig({
            theme: this.cache.get('theme') as string | undefined,
            'css.activeThemeId': this.cache.get('css.activeThemeId') as string | undefined,
            'css.themes': this.cache.get('css.themes') as never,
            customCss: this.cache.get('customCss') as string | undefined,
          });
          this.cache.set('theme.activeId', migrated['theme.activeId']);
          this.cache.set('theme.userThemes', migrated['theme.userThemes']);
          // Persist asynchronously; ignore failure (will re-run next launch).
          void fetchJson<void>('PUT', '/api/settings/client', migrated).catch(() => {});
        }
        this.initialized = true;
      } finally {
        clearTimeout(timer);
      }
    })();
    this.initPromise.catch(() => {
      // Allow a future caller to retry after a transient failure / timeout.
      if (generation === this.initGeneration) {
        this.initPromise = null;
      }
    });
    return this.initPromise;
  }

  whenReady(): Promise<void> {
    return this.initialize();
  }

  get<K extends ConfigKey>(key: K): ConfigKeyMap[K] | undefined {
    return this.cache.get(key) as ConfigKeyMap[K] | undefined;
  }

  async set<K extends ConfigKey>(key: K, value: ConfigKeyMap[K]): Promise<void> {
    this.cache.set(key, value);
    this.notify(key, value);
    await fetchJson<void>('PUT', '/api/settings/client', { [key]: value });
  }

  setLocal<K extends ConfigKey>(key: K, value: ConfigKeyMap[K]): void {
    this.cache.set(key, value);
    this.notify(key, value);
  }

  async remove(key: ConfigKey): Promise<void> {
    this.cache.delete(key);
    this.notify(key, undefined);
    await fetchJson<void>('PUT', '/api/settings/client', { [key]: null });
  }

  async setBatch(entries: Partial<{ [K in ConfigKey]: ConfigKeyMap[K] }>): Promise<void> {
    for (const [key, value] of Object.entries(entries)) {
      this.cache.set(key, value);
      this.notify(key as ConfigKey, value);
    }
    await fetchJson<void>('PUT', '/api/settings/client', entries);
  }

  subscribe(key: ConfigKey, callback: Subscriber): () => void {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }
    this.subscribers.get(key)!.add(callback);
    return () => {
      this.subscribers.get(key)?.delete(callback);
    };
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  reset(): void {
    this.cache.clear();
    this.subscribers.clear();
    this.initialized = false;
    this.initPromise = null;
    this.initGeneration += 1;
  }

  private notify(key: ConfigKey, value: unknown): void {
    const subs = this.subscribers.get(key);
    if (subs) {
      for (const cb of subs) {
        cb(value);
      }
    }
  }
}

export const configService = new ConfigServiceImpl();
