# Rollout identifiers

This Worker uses its own name and rate-limit namespace. Do not copy them onto another twin.

| Field | Value |
| --- | --- |
| Worker name | `slack-ai-teammate-agent` |
| Pre-auth rate limit binding | `SESSION_ATTEMPT_LIMITER` |
| Rate limit `namespace_id` | `61009` |
| Per-IP attempt limit | 30 requests / 60 seconds |
| Attempt key | `ip:` + `CF-Connecting-IP`, or `ip:unknown` |
| Durable Object binding | `SESSION_START_LIMITER` |
| Durable Object class | `SlackAiTeammateSessionStartLimiter` |
| Global session-start cap | 10 starts / 60 seconds |

`namespace_id` is a positive-integer string. `61009` is unique against `21015`, `748201`, `41007`, `51005`, and `31001`. Bindings that share a namespace id share counters, so those values must not be reused here.
