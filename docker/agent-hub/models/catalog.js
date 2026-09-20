const models = require('./models.json');

/** Keep deployment discovery and the Web picker on the same confirmed KB request IDs. */
function claudeModelPicker() {
  return {
    replaceBuiltInOptions: true,
    options: models.map((model) => ({ model: model.claude, label: model.label })),
  };
}

/** Retain the complete Codex schema from the pinned CLI's existing catalog. */
function codexModelCatalog(template) {
  if (!template.models?.[0]) throw new Error('Missing Codex model template');
  const templateModel = template.models[0];
  return {
    ...template,
    models: models
      .filter((model) => model.codex)
      .map((model, index) => {
        const reasoning = model.codexReasoning;
        const reasoningLevels = reasoning?.supported
          ? reasoning.supported.map((effort) => {
              const templateLevel = templateModel.supported_reasoning_levels?.find((level) => level.effort === effort);
              return (
                templateLevel ?? {
                  effort,
                  description: 'Maximum reasoning depth for the hardest problems',
                }
              );
            })
          : templateModel.supported_reasoning_levels;
        return {
          ...templateModel,
          ...(reasoning
            ? {
                default_reasoning_level: reasoning.default,
                supported_reasoning_levels: reasoningLevels,
              }
            : {}),
          slug: model.codex,
          display_name: model.label,
          priority: index,
        };
      }),
  };
}

module.exports = { claudeModelPicker, codexModelCatalog };
