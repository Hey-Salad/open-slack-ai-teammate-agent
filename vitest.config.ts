import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const bindings = {
  OPENAI_API_KEY: "test-openai-key",
  OPENAI_BASE_URL: "https://example.com/v1",
};

function outboundService(request: Request): Response {
  const streaming = request.url.endsWith("/agents/sessions");
  return new Response(streaming ? "event: test\ndata: {}\n\n" : JSON.stringify({ id: "agent_test" }), {
    status: 200,
    headers: { "Content-Type": streaming ? "text/event-stream" : "application/json" },
  });
}

function workersProject(name: string, include: string, sessionAuthSecret: string) {
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          compatibilityDate: "2026-08-22",
          bindings: {
            ...bindings,
            SESSION_AUTH_SECRET: sessionAuthSecret,
          },
          outboundService,
        },
      }),
    ],
    test: {
      name,
      include: [include],
    },
  };
}

export default defineConfig({
  test: {
    fileParallelism: false,
    projects: [
      workersProject("configured-auth", "test/configured-auth.spec.ts", "x".repeat(32)),
      workersProject("short-secret", "test/short-secret.spec.ts", "x".repeat(31)),
      {
        test: {
          name: "config",
          environment: "node",
          include: ["test/ratelimit-namespace.spec.ts"],
        },
      },
    ],
  },
});
