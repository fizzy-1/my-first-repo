import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashPassword, needsRehash, passwordProblems, verifyPassword } from "./password";

describe("hashPassword / verifyPassword", () => {
  it("verifies the original password and rejects others", async () => {
    const hash = await hashPassword("Correct-Horse-9-Battery");
    assert.equal(await verifyPassword("Correct-Horse-9-Battery", hash), true);
    assert.equal(await verifyPassword("correct-horse-9-battery", hash), false);
    assert.equal(await verifyPassword("Correct-Horse-9-Battery ", hash), false);
    assert.equal(await verifyPassword("", hash), false);
  });

  it("stores scrypt parameters with a random salt", async () => {
    const [a, b] = await Promise.all([hashPassword("Same-Password-1"), hashPassword("Same-Password-1")]);
    assert.match(a, /^scrypt\$32768\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    assert.notEqual(a, b);
    assert.equal(a.includes("Same-Password-1"), false);
  });

  it("normalises Unicode (NFKC) before hashing", async () => {
    const hash = await hashPassword("Ｐassword-12345"); // full-width P
    assert.equal(await verifyPassword("Password-12345", hash), true);
  });

  it("rejects malformed or foreign hashes instead of throwing", async () => {
    for (const stored of ["", "plain-text", "bcrypt$10$abc", "scrypt$1$2$3"]) {
      assert.equal(await verifyPassword("anything", stored), false, stored);
    }
  });

  it("flags weaker or foreign hashes for rehashing", async () => {
    assert.equal(needsRehash(await hashPassword("Fresh-Password-1")), false);
    assert.equal(needsRehash("scrypt$16384$8$1$c2FsdA==$aGFzaA=="), true);
    assert.equal(needsRehash("bcrypt$10$whatever"), true);
  });
});

describe("passwordProblems", () => {
  it("accepts a password meeting every rule", () => {
    assert.deepEqual(passwordProblems("Integral!2026"), []);
  });

  it("reports each missing character class", () => {
    assert.deepEqual(passwordProblems("integral!2026"), ["Include an uppercase letter."]);
    assert.deepEqual(passwordProblems("INTEGRAL!2026"), ["Include a lowercase letter."]);
    assert.deepEqual(passwordProblems("Integral!Academy"), ["Include a number."]);
    assert.deepEqual(passwordProblems("Integral12026"), ["Include a symbol."]);
  });

  it("enforces the length limits", () => {
    assert.deepEqual(passwordProblems("Short!2026a"), ["Use at least 12 characters."]); // 11 characters
    assert.deepEqual(passwordProblems(`Aa1!${"x".repeat(197)}`), ["Use at most 200 characters."]); // 201 characters
    assert.deepEqual(passwordProblems(`Aa1!${"x".repeat(196)}`), []); // exactly 200
  });

  it("lists every problem for an empty password", () => {
    assert.equal(passwordProblems("").length, 5);
  });
});
