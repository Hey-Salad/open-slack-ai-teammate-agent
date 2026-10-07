# AI Teammate for Slack

Runnable Cloudflare Worker and curl-first example for the OpenAI Agents API. It creates a reusable agent named `AI teammate for Slack`, starts a streamed session from the returned `agent_id`, and streams raw session events.

## Files

- `config/agent-definition.json` contains the reusable agent definition.
- `config/session-input.txt` contains the initial user message.
- `scripts/run-agent-session.sh` calls the Agents HTTP API directly with `curl`.
- `src/index.ts` is a Cloudflare Worker UI/API layer that mirrors the same flow.

## Setup

```bash
npm install
export OPENAI_API_KEY="your-api-key"
export SESSION_AUTH_SECRET="$(openssl rand -hex 32)"
```

The app uses OpenAI project `proj_mRsQVx3NjOamxeXH6UrLowoC` via the `OpenAI-Project` header by default.

`POST /api/sessions` requires `Authorization: Bearer <SESSION_AUTH_SECRET>`. If that secret is missing or shorter than 32 characters, the route returns 503 and does not start a session. Each client is limited to 10 attempts per 60 seconds before the bearer token is checked. The attempt key is `ip:` plus `CF-Connecting-IP`, or `ip:unknown` when that header is missing. Authenticated session starts are capped at 10 per 60 seconds for the whole Worker by the `SlackAiTeammateSessionStartLimiter` Durable Object. The Worker name is `slack-ai-teammate-agent`.

## Run Locally

```bash
npm run run:agent
npm run typecheck
npm test
npm run dev
```

## Deploy To Cloudflare Workers

```bash
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put SESSION_AUTH_SECRET
npm run deploy
```

Do not commit `SESSION_AUTH_SECRET` or `OPENAI_API_KEY`. Set `SESSION_AUTH_SECRET` to a random value of at least 32 characters.

Default Agents API environment is `openai_hosted`. Set `AGENTS_ENVIRONMENT_TYPE=none` only when no sandbox is needed.
