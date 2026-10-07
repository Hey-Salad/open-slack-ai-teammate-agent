import { reset } from "cloudflare:test";
import { afterEach, expect, it } from "vitest";
import { sessionRequest } from "./session-request";

afterEach(async () => {
  await reset();
});

it("returns 503 when the auth secret is shorter than 32 characters", async () => {
  const response = await sessionRequest({
    ip: "203.0.113.5",
    token: "x".repeat(32),
  });
  const body = await response.json();
  expect(response.status).toBe(503);
  expect(body).toEqual({ error: "Session auth is not configured." });
  expect(JSON.stringify(body)).not.toContain("x".repeat(31));
});

it("applies the per-IP attempt limiter before the short-secret bearer check", async () => {
  const ip = "203.0.113.6";
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await sessionRequest({ ip, token: "x".repeat(32) });
    expect(response.status).toBe(503);
  }

  const blocked = await sessionRequest({ ip, token: "x".repeat(32) });
  expect(blocked.status).toBe(429);
  expect(await blocked.json()).toEqual({ error: "Too many session start attempts from this client." });
});
