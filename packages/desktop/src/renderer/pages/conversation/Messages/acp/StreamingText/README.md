# Studio streaming text

Only presentation is paced. The message store, persisted history, clipboard and agent protocol retain the complete received text. The existing 32 ms message merge interval is unchanged.

- Append-only active replies reveal at roughly 30 paints/second, adapting speed to the backlog, with an 800 ms catch-up deadline after the last input.
- Completion drains the remaining text within 120 ms; explicit stop, hidden tabs, reduced motion and replacement text flush immediately.
- Historical messages render immediately. A newly created active message may animate its first burst; an old message opened mid-turn starts with its existing content visible.
- Grapheme boundaries preserve emoji and combining sequences. Animation owns its own state and cancels on unmount; it does not repaint the message list on each animation tick.
- An empty upstream buffer still causes a pause. This does not hide model thinking, tool execution or network stalls, and does not guarantee that KB itself is streaming evenly.

## Diagnosis (2026-10-09, local arm64 container)

A neutral Chinese prose prompt was sampled through both native API formats and through actual Claude/Codex conversations. Only event timings and lengths were recorded; credentials and response bodies are not part of these measurements.

| Measurement                      | Text events | Characters | Median interval | 95th percentile interval | Largest interval |
| -------------------------------- | ----------: | ---------: | --------------: | -----------------------: | ---------------: |
| KB Messages API                  |         556 |        869 |            0 ms |                     0 ms |         2,275 ms |
| KB Responses API                 |         436 |        617 |            0 ms |                     0 ms |         1,245 ms |
| Claude → Core → Studio WebSocket |         557 |        803 |            0 ms |                     2 ms |         2,207 ms |
| Codex → Core → Studio WebSocket  |         907 |      1,416 |            0 ms |                     2 ms |         1,274 ms |

These are separate requests, not a synchronized distributed trace. They demonstrate upstream burst delivery in both protocols, but cannot distinguish KB buffering from its model provider or precisely attribute per-layer delay. Core relays events as they arrive; the renderer batches at 32 ms. Reducing that timer alone cannot remove the observed second-long input gaps. No KB/server configuration was changed.

## Browser validation

Real sends through each agent's input box were sampled at 16 ms intervals, recording rendered text lengths only. Separate same-prompt requests naturally produce different text lengths; these figures establish that pacing is active, not a provider throughput benchmark.

| Local browser sample | Positive text updates | Largest visible increment | 95th percentile increment | Median interval |
| -------------------- | --------------------: | ------------------------: | ------------------------: | --------------: |
| Claude before        |                    14 |            175 characters |                         — |           50 ms |
| Claude after         |                    94 |             35 characters |             10 characters |           45 ms |
| Codex after          |                   113 |             25 characters |              6 characters |           47 ms |

A finish event can precede the last 32 ms message-merge flush. The hook retains a short completion grace period so that the trailing chunk also drains within 120 ms instead of appearing all at once. Regression tests cover this event ordering as well as frequent input, history, replacement text, explicit stop, hidden tabs, reduced motion, grapheme boundaries and unmount cleanup.

## Thinking and tool output

The same bounded reveal now covers expanded thinking text, expanded tool-summary text output, standalone ACP tool text, and delegated terminal output. Thinking/terminal tail-follow tracks the displayed text instead of jumping to the latest raw buffer. Collapsed details and historical results render immediately; no artificial streaming is invented for a tool that reports only a completed result. Tool arguments, titles, diffs, approval controls and execution status remain synchronous. Thinking completion/collapse, tool failure/cancellation and terminal errors/stop requests flush text immediately.

A real Codex read-only Python run (30 Fibonacci rows, flushed every 200 ms) completed normally during follow-up verification. In that run the persisted `tool_call.content.output` already began at row 2; the UI matched that stored output. This pre-renderer first-row omission remains unresolved and must not be attributed to, or considered fixed by, the presentation animation.
