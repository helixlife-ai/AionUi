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

export const STUDIO_FALLBACK_MODEL: StudioModelOption = {
  id: 'agenthub-deepseek-v4-1-flash',
  label: 'DeepSeek-V4.1-Flash',
};

/** Both protocols use the same confirmed KB Flash request ID. */
export function getStudioFallback(_backend: StudioBackend): StudioModelOption {
  return { ...STUDIO_FALLBACK_MODEL };
}

/** Legacy aliases remain valid in KB; new drafts use canonical IDs and Web displays the current label. */
const legacyModelIds: Record<string, string> = {
  'agenthub-claude': STUDIO_FALLBACK_MODEL.id,
  'agenthub-codex': STUDIO_FALLBACK_MODEL.id,
  // Claude ACP uses `default` as a runtime sentinel for its provider default.
  default: STUDIO_FALLBACK_MODEL.id,
  'agenthub-glm5-3': 'agenthub-glm-5-3',
  'deepseek-v4-flash': STUDIO_FALLBACK_MODEL.id,
  'glm-5.3': 'agenthub-glm-5-3',
  'qwen3.5-plus': 'agenthub-qwen3-5-plus',
  'qwen3.7-plus': 'agenthub-qwen3-7-plus',
};

export function normalizeStudioModelId(value?: string | null): string | null {
  if (!value) return null;
  return legacyModelIds[value.toLowerCase()] ?? value;
}

export function isStudioDefaultModelId(value?: string | null): boolean {
  return value?.trim().toLowerCase() === 'default';
}

/** All confirmed KB models support both Messages and Responses. */
export function getStudioModels(backend: StudioBackend): StudioModelOption[] {
  return modelDefinitions.flatMap((model) => (model[backend] ? [{ id: model[backend], label: model.label }] : []));
}

export const STUDIO_MODEL_RATES: StudioModelRates = Object.fromEntries(
  modelDefinitions.flatMap((model) => [model.claude, model.codex].filter(Boolean).map((id) => [id, model.rate]))
);

/** New drafts default to Flash, independently of another session's CLI default. */
export function resolveStudioDraftModel(backend: StudioBackend, value?: string | null): string {
  const normalized = normalizeStudioModelId(value);
  return getStudioModels(backend).some((model) => model.id === normalized)
    ? normalized!
    : getStudioFallback(backend).id;
}

/** Resolve the runtime sentinel without discarding a model persisted on the conversation. */
export function resolveStudioConversationModel(
  backend: StudioBackend,
  runtimeValue?: string | null,
  persistedValue?: string | null
): string | null {
  if (isStudioDefaultModelId(runtimeValue)) {
    return persistedValue ? resolveStudioDraftModel(backend, persistedValue) : getStudioFallback(backend).id;
  }
  return runtimeValue || persistedValue || null;
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
  'agenthub-deepseek-v4-1-flash': 'agent.studioModels.scenarios.daily',
  'agenthub-glm-5-3': 'agent.studioModels.scenarios.report',
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
