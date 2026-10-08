import assert from "node:assert/strict";
import { test } from "node:test";
import { clientIp } from "./client-ip";

test("uses the address appended by the trusted proxy, not client-supplied entries", () => {
  assert.equal(clientIp("6.6.6.6, 203.0.113.9", null, 1), "203.0.113.9");
  assert.equal(clientIp("6.6.6.6, 198.51.100.4, 10.0.0.2", null, 2), "198.51.100.4");
});

test("falls back to the left-most entry when there are fewer entries than hops", () => {
  assert.equal(clientIp("203.0.113.9", null, 3), "203.0.113.9");
});

test("uses X-Real-IP only when there is no X-Forwarded-For", () => {
  assert.equal(clientIp(null, " 192.0.2.1 ", 1), "192.0.2.1");
  assert.equal(clientIp("", null, 1), null);
});

test("treats invalid hop counts as one", () => {
  assert.equal(clientIp("6.6.6.6, 203.0.113.9", null, 0), "203.0.113.9");
  assert.equal(clientIp("6.6.6.6, 203.0.113.9", null, Number.NaN), "203.0.113.9");
});
