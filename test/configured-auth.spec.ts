import { SELF, reset } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { sessionRequest } from "./session-request";

const SECRET = "x".repeat(32);

afterEach(async () => {
  await reset();
});

describe("configured session auth", () => {
  it("leaves health and the home page open", async () => {
    const health = await SELF.fetch("https://example.com/health");
    const home = await SELF.fetch("https://example.com/");
    expect(health.status).toBe(200);
    expect(home.status).toBe(200);
    expect(await home.text()).toContain("session-token");
  });

  it("returns 401 for a missing or wrong bearer without starting a session", async () => {
    const missing = await sessionRequest({ ip: "203.0.113.10" });
    const wrong = await sessionRequest({ ip: "203.0.113.11", token: "not-the-secret" });
    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: "Unauthorized." });
  });

  it("counts attempts for ip: plus CF-Connecting-IP before accepting the bearer", async () => {
    const ip = "203.0.113.20";
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await sessionRequest({ ip, token: "wrong-token" });
      expect(response.status).toBe(401);
    }

    const blocked = await sessionRequest({ ip, token: SECRET });
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: "Too many session start attempts from this client." });

    const otherClient = await sessionRequest({ ip: "203.0.113.21", token: "wrong-token" });
    expect(otherClient.status).toBe(401);
  });

  it("shares the ip:unknown bucket when CF-Connecting-IP is missing and ignores X-Forwarded-For", async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await sessionRequest({ token: "wrong-token", forwardedFor: `203.0.113.${attempt}` });
      expect(response.status).toBe(401);
    }

    const stillUnknown = await sessionRequest({ token: SECRET, forwardedFor: "198.51.100.8" });
    expect(stillUnknown.status).toBe(429);

    const identified = await sessionRequest({ ip: "203.0.113.30", token: "wrong-token", forwardedFor: "198.51.100.8" });
    expect(identified.status).toBe(401);
  });

  it("caps authenticated session starts at 10 per 60 seconds across clients", async () => {
    for (let index = 0; index < 10; index += 1) {
      const response = await sessionRequest({ ip: `203.0.113.${40 + index}`, token: SECRET });
      expect(response.status).toBe(200);
    }

    const capped = await sessionRequest({ ip: "203.0.113.90", token: SECRET });
    expect(capped.status).toBe(429);
    expect(await capped.json()).toEqual({ error: "Too many session starts." });
    expect(capped.headers.get("Retry-After")).toBe("60");
  });

  it("does not consume the global session-start cap on failed bearer checks", async () => {
    for (let index = 0; index < 10; index += 1) {
      const response = await sessionRequest({ ip: `198.51.100.${index + 1}`, token: "wrong-token" });
      expect(response.status).toBe(401);
    }

    const allowed = await sessionRequest({ ip: "198.51.100.50", token: SECRET });
    expect(allowed.status).toBe(200);
  });
});
