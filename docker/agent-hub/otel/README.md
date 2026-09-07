# Native Agent OpenTelemetry

`configure-codex-otel.js` appends Codex's native trace exporter to the generated
`config.toml`. Claude Code is configured separately by its launch wrapper so
the two agent processes receive distinct telemetry attributes.

Telemetry is configured through the standard `OTEL_TRACES_EXPORTER`,
`OTEL_EXPORTER_OTLP_ENDPOINT`, and `OTEL_EXPORTER_OTLP_PROTOCOL` variables.
