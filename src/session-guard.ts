const MIN_SESSION_AUTH_SECRET_LENGTH = 32;
const GLOBAL_SESSION_START_LIMIT = 10;
const WINDOW_MS = 60_000;
const LIMITER_OBJECT_NAME = "slack-ai-teammate-session-start";
const MAX_IP_LENGTH = 128;

type WindowCounter = {
  windowStart: number;
  count: number;
};

type GuardEnv = {
  SESSION_AUTH_SECRET?: string;
  SESSION_ATTEMPT_LIMITER: RateLimit;
  SESSION_START_LIMITER: DurableObjectNamespace;
};

export function clientAttemptKey(request: Request): string {
  const header = request.headers.get("CF-Connecting-IP");
  if (header == null) return "ip:unknown";
  const ip = header.trim();
  if (!ip || ip.length > MAX_IP_LENGTH) return "ip:unknown";
  return `ip:${ip}`;
}

export class SlackAiTeammateSessionStartLimiter implements DurableObject {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    if (url.pathname === "/session-start") {
      const allowed = await consume(this.state.storage, "session-start:global", GLOBAL_SESSION_START_LIMIT);
      return jsonResponse({ allowed }, allowed ? 200 : 429);
    }

    return jsonResponse({ error: "Not found" }, 404);
  }
}

export async function guardSessionStart(request: Request, env: GuardEnv): Promise<Response | null> {
  const attempt = await limitIpAttempt(env, clientAttemptKey(request));
  if (!attempt.ok) return attempt.response;
  if (!attempt.allowed) {
    return jsonResponse({ error: "Too many session start attempts from this client." }, 429, {
      "Retry-After": "60",
    });
  }

  const secret = typeof env.SESSION_AUTH_SECRET === "string" ? env.SESSION_AUTH_SECRET : "";
  if (secret.length < MIN_SESSION_AUTH_SECRET_LENGTH) {
    return jsonResponse({ error: "Session auth is not configured." }, 503);
  }

  const presented = bearerToken(request);
  if (!presented || !timingSafeEqualString(presented, secret)) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }

  const start = await postLimiter(env, "/session-start", {});
  if (!start.ok) return start.response;
  if (!start.allowed) {
    return jsonResponse({ error: "Too many session starts." }, 429, {
      "Retry-After": "60",
    });
  }

  return null;
}

async function consume(storage: DurableObjectStorage, key: string, limit: number): Promise<boolean> {
  const now = Date.now();
  return storage.transaction(async (txn) => {
    const current = await txn.get<WindowCounter>(key);
    if (!current || now - current.windowStart >= WINDOW_MS) {
      await txn.put(key, { windowStart: now, count: 1 } satisfies WindowCounter);
      return true;
    }
    if (current.count >= limit) return false;
    await txn.put(key, { windowStart: current.windowStart, count: current.count + 1 } satisfies WindowCounter);
    return true;
  });
}

async function limitIpAttempt(
  env: GuardEnv,
  key: string,
): Promise<{ ok: true; allowed: boolean; response?: undefined } | { ok: false; allowed?: undefined; response: Response }> {
  try {
    const outcome = await env.SESSION_ATTEMPT_LIMITER.limit({ key });
    return { ok: true, allowed: outcome.success };
  } catch {
    return {
      ok: false,
      response: jsonResponse({ error: "Session start protection is unavailable." }, 503),
    };
  }
}

async function postLimiter(
  env: GuardEnv,
  pathname: string,
  body: unknown,
): Promise<{ ok: true; allowed: boolean; response?: undefined } | { ok: false; allowed?: undefined; response: Response }> {
  try {
    const stub = env.SESSION_START_LIMITER.get(env.SESSION_START_LIMITER.idFromName(LIMITER_OBJECT_NAME));
    const response = await stub.fetch(`https://session-start-limiter.internal${pathname}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.status === 429) return { ok: true, allowed: false };
    if (!response.ok) {
      return {
        ok: false,
        response: jsonResponse({ error: "Session start protection is unavailable." }, 503),
      };
    }
    const payload = (await response.json().catch(() => null)) as { allowed?: unknown } | null;
    return { ok: true, allowed: payload?.allowed === true };
  } catch {
    return {
      ok: false,
      response: jsonResponse({ error: "Session start protection is unavailable." }, 503),
    };
  }
}

function bearerToken(request: Request): string {
  const header = request.headers.get("Authorization");
  if (!header) return "";
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return match?.[1] ?? "";
}

function timingSafeEqualString(leftValue: string, rightValue: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(leftValue);
  const right = encoder.encode(rightValue);
  const length = Math.max(left.length, right.length, 1);
  let mismatch = left.length === right.length ? 0 : 1;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return mismatch === 0;
}

function jsonResponse(body: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}
