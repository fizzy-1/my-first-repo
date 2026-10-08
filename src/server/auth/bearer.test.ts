import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bearerToken, checkBearer, requireBearer, safeEqual } from "./bearer";

const SECRET = "3f9c1a7e5b2d4c6a8e0f1b3d5c7e9a1b";

describe("bearerToken", () => {
  it("extracts the token, accepting any case for the scheme", () => {
    assert.equal(bearerToken(`Bearer ${SECRET}`), SECRET);
    assert.equal(bearerToken(`bearer ${SECRET}`), SECRET);
    assert.equal(bearerToken(`BEARER   ${SECRET}  `), SECRET);
  });

  it("rejects other schemes and malformed headers", () => {
    for (const header of [null, undefined, "", "Bearer", "Bearer ", `Basic ${SECRET}`, `Token ${SECRET}`, "Bearer two tokens", SECRET]) {
      assert.equal(bearerToken(header), null, String(header));
    }
  });

  it("ignores absurdly long headers", () => {
    assert.equal(bearerToken(`Bearer ${"a".repeat(2000)}`), null);
  });
});

describe("safeEqual", () => {
  it("is true only for identical strings", () => {
    assert.equal(safeEqual(SECRET, SECRET), true);
    assert.equal(safeEqual(SECRET.replace(/.$/, "0"), SECRET), false);
    assert.equal(safeEqual(SECRET.toUpperCase(), SECRET), false);
  });

  it("handles different lengths without throwing", () => {
    assert.equal(safeEqual(SECRET.slice(0, -1), SECRET), false);
    assert.equal(safeEqual(`${SECRET}x`, SECRET), false);
    assert.equal(safeEqual("", SECRET), false);
  });

  it("compares bytes, so multi-byte characters cannot alias", () => {
    assert.equal(safeEqual("é", "é"), true);
    assert.equal(safeEqual("é", "é"), false);
  });
});

describe("checkBearer", () => {
  it("is unconfigured while the secret is missing or blank, whatever the caller sends", () => {
    assert.equal(checkBearer(`Bearer ${SECRET}`, undefined), "unconfigured");
    assert.equal(checkBearer("Bearer ", ""), "unconfigured");
    assert.equal(checkBearer("Bearer x", "   "), "unconfigured");
  });

  it("accepts only the configured token", () => {
    assert.equal(checkBearer(`Bearer ${SECRET}`, SECRET), "ok");
    assert.equal(checkBearer(`Bearer ${SECRET}`, `  ${SECRET}\n`), "ok"); // stray whitespace in .env
    assert.equal(checkBearer("Bearer wrong", SECRET), "unauthorized");
    assert.equal(checkBearer(null, SECRET), "unauthorized");
    assert.equal(checkBearer(`Basic ${SECRET}`, SECRET), "unauthorized");
  });
});

describe("requireBearer", () => {
  const request = (authorization?: string) =>
    new Request("http://localhost/api/cron/deadlines", { method: "POST", headers: authorization ? { authorization } : {} });

  it("lets an authorised request through", () => {
    assert.equal(requireBearer(request(`Bearer ${SECRET}`), SECRET, "CRON_SECRET"), null);
  });

  it("answers 401 with a Bearer challenge for a missing or wrong token", async () => {
    for (const auth of [undefined, "Bearer nope"]) {
      const response = requireBearer(request(auth), SECRET, "CRON_SECRET");
      assert.ok(response);
      assert.equal(response.status, 401);
      assert.match(response.headers.get("www-authenticate") ?? "", /^Bearer /);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(await response.json(), { error: "Unauthorized" });
    }
  });

  it("answers 503 while the secret is unset", async () => {
    const response = requireBearer(request(`Bearer ${SECRET}`), undefined, "CRON_SECRET");
    assert.ok(response);
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /CRON_SECRET/);
  });
});
