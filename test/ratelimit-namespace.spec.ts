import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const OTHER_NAMESPACE_IDS = ["21015", "748201", "41007", "51005", "31001"];

it("uses a positive-integer SESSION_ATTEMPT_LIMITER namespace id", () => {
  const text = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  const config = JSON.parse(text) as {
    ratelimits: Array<{ name: string; namespace_id: string; simple: { limit: number; period: number } }>;
  };
  const binding = config.ratelimits.find((item) => item.name === "SESSION_ATTEMPT_LIMITER");
  expect(binding).toBeDefined();
  const namespaceId = binding?.namespace_id ?? "";
  expect(namespaceId).toMatch(/^[1-9][0-9]*$/);
  expect(Number.isInteger(Number(namespaceId))).toBe(true);
  expect(Number(namespaceId)).toBeGreaterThan(0);
  expect(namespaceId).toBe("61009");
  expect(OTHER_NAMESPACE_IDS).not.toContain(namespaceId);
  expect(binding?.simple).toEqual({ limit: 30, period: 60 });
});
