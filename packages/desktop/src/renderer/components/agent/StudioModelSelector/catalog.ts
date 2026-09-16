import modelDefinitions from './models.json';

/** Enable the Studio presentation only in the browser host. */
export function isStudioModelSelectorEnabled(): boolean {
  return typeof window !== 'undefined' && !window.electronAPI;
}

export type StudioModelOption = { id: string; label: string; description?: string };
export type StudioModelRate = number | { min: number; max: number };
export type StudioModelRates = Record<string, StudioModelRate | null>;

export type StudioBackend = 'claude' | 'codex';
export const isStudioBackend = (backend?: string): backend is StudioBackend =>
  backend === 'claude' || backend === 'codex';

export const STUDIO_FALLBACK_MODEL: StudioModelOption = { id: 'agenthub-claude', label: 'DeepSeek-V4.1-Flash' };

/** The two stable KB aliases both route to Flash; never use a display name as a request ID. */
export function getStudioFallback(backend: StudioBackend): StudioModelOption {
  return { ...STUDIO_FALLBACK_MODEL, id: backend === 'codex' ? 'agenthub-codex' : 'agenthub-claude' };
}

/** Codex uses Responses; GLM-5.3 currently supports Messages only. */
export function getStudioModels(backend: StudioBackend): StudioModelOption[] {
  return modelDefinitions.flatMap((model) => (model[backend] ? [{ id: model[backend], label: model.label }] : []));
}

export const STUDIO_MODEL_RATES: StudioModelRates = Object.fromEntries(
  modelDefinitions.flatMap((model) => [model.claude, model.codex].filter(Boolean).map((id) => [id, model.rate]))
);

/** New drafts default to Flash, independently of another session's CLI default. */
export function resolveStudioDraftModel(backend: StudioBackend, value?: string | null): string {
  return getStudioModels(backend).some((model) => model.id === value) ? value! : getStudioFallback(backend).id;
}

/** Always retain the fallback, including failed/empty future catalog responses. */
export function withStudioFallback(
  models: StudioModelOption[] | null | undefined,
  backend: StudioBackend = 'claude'
): StudioModelOption[] {
  const fallback = getStudioFallback(backend);
  const result = (models ?? []).filter((model) => model.id !== fallback.id);
  const position = models?.findIndex((model) => model.id === fallback.id) ?? -1;
  result.splice(position < 0 ? 0 : Math.min(position, result.length), 0, fallback);
  return result;
}

const descriptions = {
  'agenthub-qwen3-5-plus': 'agent.studioModels.scenarios.reading',
  'agenthub-qwen3-7-plus': 'agent.studioModels.scenarios.analysis',
  'agenthub-claude': 'agent.studioModels.scenarios.daily',
  'agenthub-codex': 'agent.studioModels.scenarios.daily',
  'agenthub-glm5-3': 'agent.studioModels.scenarios.report',
  'agenthub-kimi-k3': 'agent.studioModels.scenarios.longContext',
} as const;

/** Match only explicit model IDs; display labels and CLI aliases are not routing identities. */
export function getStudioModelDescriptionKey(id: string) {
  return descriptions[id.toLowerCase() as keyof typeof descriptions];
}

/** Missing or invalid rates never become a zero-price promise. */
export function formatStudioModelRate(rate: StudioModelRate | null | undefined): string {
  if (typeof rate === 'number') return valid(rate) ? `${format(rate)}×` : '--';
  if (!rate || !valid(rate.min) || !valid(rate.max) || rate.min > rate.max) return '--';
  return rate.min === rate.max ? `${format(rate.min)}×` : `${format(rate.min)}～${format(rate.max)}×`;
}

const valid = (value: number) => Number.isFinite(value) && value >= 0;
const format = (value: number) => String(Number(value.toFixed(2)));
