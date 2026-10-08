import assert from "node:assert/strict";
import test from "node:test";
import { googleRedirectUri } from "../../dist-server/google-config.js";

test("callback usa origem HTTPS explícita em produção", () => {
  assert.equal(googleRedirectUri("https://crm.avilaops.com/", true), "https://crm.avilaops.com/api/integrations/google/callback");
  for (const value of [undefined, "http://crm.avilaops.com", "http://localhost:3000", "https://user:pass@example.com", "https://example.com/path", "https://example.com?x=1", "https://example.com#x", "invalid"]) {
    assert.equal(googleRedirectUri(value, true), null);
  }
});

test("desenvolvimento permite HTTP só no loopback", () => {
  assert.equal(googleRedirectUri(undefined, false), "http://localhost:3000/api/integrations/google/callback");
  assert.equal(googleRedirectUri("http://evil.example", false), null);
});
