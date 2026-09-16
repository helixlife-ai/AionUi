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
  return {
    ...template,
    models: models
      .filter((model) => model.codex)
      .map((model, index) => ({
        ...template.models[0],
        slug: model.codex,
        display_name: model.label,
        priority: index,
      })),
  };
}

module.exports = { claudeModelPicker, codexModelCatalog };
