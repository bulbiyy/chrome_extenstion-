import assert from "node:assert/strict";
import test from "node:test";
import { createUserSession, ANONYMOUS_USER } from "../src/background/userSession.js";

function createMemoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    async get(keys) {
      return Object.fromEntries(keys.map((key) => [key, data[key]]));
    },
    async set(values) {
      Object.assign(data, values);
    },
    async clear() {
      for (const key of Object.keys(data)) {
        delete data[key];
      }
    },
  };
}

test("sign-in persists the user profile and session marker", async () => {
  const storage = createMemoryStorage();
  const session = createUserSession(storage);
  const profile = { userId: "user-123", name: "Ada" };

  const result = await session.signIn(profile);

  assert.deepEqual(result, profile);
  assert.deepEqual(storage.data, {
    userProfile: profile,
    sessionMarker: true,
  });
  assert.equal(await session.getCurrentUser(), "user-123");
});

test("returns anonymous if no active profile session exists", async () => {
  const session = createUserSession(createMemoryStorage({
    userProfile: { userId: "stale-user" },
  }));

  assert.equal(await session.getCurrentUser(), ANONYMOUS_USER);
});

test("sign-out clears all stored data", async () => {
  const storage = createMemoryStorage({
    userProfile: { userId: "user-123" },
    sessionMarker: true,
    selectedText: "Pad Thai",
    recipeResponse: { ok: true },
  });
  const session = createUserSession(storage);

  await session.signOut();

  assert.deepEqual(storage.data, {});
  assert.equal(await session.getCurrentUser(), ANONYMOUS_USER);
});

test("sign-in rejects profiles without a non-empty userId", async () => {
  const session = createUserSession(createMemoryStorage());

  await assert.rejects(
    session.signIn({ name: "Ada" }),
    { name: "TypeError" },
  );
});
