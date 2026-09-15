export type StudioModelOption = { id: string; label: string; description?: string };
export type StudioModelRate = number | { min: number; max: number };
export type StudioModelRates = Record<string, StudioModelRate | null>;

export const STUDIO_MODEL_DEMO_ENABLED = true;
export const STUDIO_FALLBACK_MODEL: StudioModelOption = { id: 'deepseek-v4-flash', label: 'DeepSeek-V4.1-Flash' };
export const STUDIO_DEMO_MODELS: StudioModelOption[] = [
  { id: 'qwen3.5-plus', label: 'Qwen3.5-Plus' },
  { id: 'qwen3.7-plus', label: 'Qwen3.7-Plus' },
  STUDIO_FALLBACK_MODEL,
  { id: 'glm-5.3', label: 'GLM-5.3' },
  { id: 'kimi-k3', label: 'Kimi-K3' },
];
export const STUDIO_DEMO_RATES: StudioModelRates = {
  'qwen3.5-plus': 0.29,
  'qwen3.7-plus': 0.64,
  'deepseek-v4-flash': { min: 0.44, max: 0.89 },
  'glm-5.3': 1.9,
  'kimi-k3': 4.22,
};

/** Codex uses Responses; GLM-5.3 currently supports Messages only. */
export function getStudioDemoModels(backend?: string): StudioModelOption[] {
  return STUDIO_DEMO_MODELS.filter((model) => backend !== 'codex' || model.id !== 'glm-5.3');
}

/** Always retain the fallback, including failed/empty future catalog responses. */
export function withStudioFallback(models: StudioModelOption[] | null | undefined): StudioModelOption[] {
  const result = (models ?? []).filter((model) => model.id.toLowerCase() !== STUDIO_FALLBACK_MODEL.id);
  const supplied = models?.find((model) => model.id.toLowerCase() === STUDIO_FALLBACK_MODEL.id);
  const fallback = { ...STUDIO_FALLBACK_MODEL, ...supplied, label: STUDIO_FALLBACK_MODEL.label };
  const position = models?.findIndex((model) => model.id.toLowerCase() === STUDIO_FALLBACK_MODEL.id) ?? -1;
  result.splice(position < 0 ? 0 : Math.min(position, result.length), 0, fallback);
  return result;
}

const descriptions = {
  'qwen3.5-plus': 'agent.studioModels.scenarios.reading',
  'qwen3.7-plus': 'agent.studioModels.scenarios.analysis',
  'deepseek-v4-flash': 'agent.studioModels.scenarios.daily',
  'deepseek-v4-pro': 'agent.studioModels.scenarios.reasoning',
  'glm-5.3': 'agent.studioModels.scenarios.report',
  'kimi-k3': 'agent.studioModels.scenarios.longContext',
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
