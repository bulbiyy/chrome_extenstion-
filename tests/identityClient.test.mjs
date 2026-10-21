import assert from "node:assert/strict";
import test from "node:test";
import { createIdentityClient } from "../src/background/identityClient.js";

function makeIdentityApi(tokenResult = { token: "test-access-token" }) {
  return {
    getAuthToken: async () => tokenResult,
  };
}

function makeProfileResponse(profile, ok = true) {
  return {
    ok,
    json: async () => profile,
  };
}

test("signs in and returns a validated Google profile", async () => {
  let request;
  const client = createIdentityClient({
    identityApi: makeIdentityApi(),
    fetchImpl: async (url, options) => {
      request = { url, options };
      return makeProfileResponse({
        sub: "google-user-123",
        email: "person@example.com",
        name: "Example Person",
        picture: "https://example.com/avatar.png",
      });
    },
  });

  const result = await client.signIn();

  assert.deepEqual(result, {
    ok: true,
    data: {
      id: "google-user-123",
      email: "person@example.com",
      name: "Example Person",
      picture: "https://example.com/avatar.png",
    },
  });
  assert.equal(
    request.url,
    "https://www.googleapis.com/oauth2/v3/userinfo",
  );
  assert.equal(
    request.options.headers.Authorization,
    "Bearer test-access-token",
  );
});

test("accepts the legacy string token result", async () => {
  let authorization;
  const client = createIdentityClient({
    identityApi: makeIdentityApi("legacy-token"),
    fetchImpl: async (_url, options) => {
      authorization = options.headers.Authorization;
      return makeProfileResponse({
        sub: "user",
        email: "person@example.com",
        name: "Person",
      });
    },
  });

  const result = await client.signIn();

  assert.equal(result.ok, true);
  assert.equal(result.data.picture, null);
  assert.equal(authorization, "Bearer legacy-token");
});

test("returns a cancellation error when the user declines sign-in", async () => {
  const client = createIdentityClient({
    identityApi: {
      getAuthToken: async () => {
        throw new Error("The user did not approve access.");
      },
    },
    fetchImpl: async () => {
      throw new Error("Fetch must not run.");
    },
  });

  assert.deepEqual(await client.signIn(), {
    ok: false,
    error: {
      code: "auth_cancelled",
      message: "Google sign-in was canceled.",
    },
  });
});

test("returns an authentication error when token retrieval fails", async () => {
  const client = createIdentityClient({
    identityApi: {
      getAuthToken: async () => {
        throw new Error("OAuth configuration is invalid.");
      },
    },
    fetchImpl: async () => {
      throw new Error("Fetch must not run.");
    },
  });

  assert.equal((await client.signIn()).error.code, "auth_error");
});

test("returns a profile error when Google rejects the profile request", async () => {
  const client = createIdentityClient({
    identityApi: makeIdentityApi(),
    fetchImpl: async () => makeProfileResponse(null, false),
  });

  assert.equal((await client.signIn()).error.code, "profile_error");
});

test("returns a profile error when fetching the profile fails", async () => {
  const client = createIdentityClient({
    identityApi: makeIdentityApi(),
    fetchImpl: async () => {
      throw new Error("Network unavailable.");
    },
  });

  assert.equal((await client.signIn()).error.code, "profile_error");
});

test("rejects malformed Google profile data", async () => {
  const client = createIdentityClient({
    identityApi: makeIdentityApi(),
    fetchImpl: async () =>
      makeProfileResponse({
        sub: "google-user-123",
        email: "person@example.com",
        name: "",
      }),
  });

  assert.equal((await client.signIn()).error.code, "bad_response");
});

test("reports when the identity API is unavailable", async () => {
  const client = createIdentityClient({
    identityApi: undefined,
    fetchImpl: async () => {
      throw new Error("Fetch must not run.");
    },
  });

  assert.equal((await client.signIn()).error.code, "auth_error");
});
