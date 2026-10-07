import { SELF } from "cloudflare:test";

export function sessionRequest(options: {
  ip?: string | null;
  token?: string;
  forwardedFor?: string;
} = {}): Promise<Response> {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (options.ip) headers.set("CF-Connecting-IP", options.ip);
  if (options.forwardedFor) headers.set("X-Forwarded-For", options.forwardedFor);
  if (options.token !== undefined) headers.set("Authorization", `Bearer ${options.token}`);
  return SELF.fetch("https://example.com/api/sessions", {
    method: "POST",
    headers,
    body: JSON.stringify({ input: "hello" }),
  });
}
