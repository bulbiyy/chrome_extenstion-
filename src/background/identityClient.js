const USER_INFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

function failure(code, message) {
  return { ok: false, error: { code, message } };
}

function isUserCancellation(error) {
  return /user did not approve|user canceled|user cancelled|user denied/i.test(
    error?.message || "",
  );
}

function parseGoogleProfile(profile) {
  if (profile === null ||
    typeof profile !== "object" ||
    typeof profile.sub !== "string" ||
    profile.sub.trim() === "" ||
    typeof profile.email !== "string" ||
    profile.email.trim() === "" ||
    typeof profile.name !== "string" ||
    profile.name.trim() === "" ||
    !(typeof profile.picture === "string" || profile.picture == null) ) {
    return null;
  }

  return {
    id: profile.sub,
    email: profile.email,
    name: profile.name,
    picture: profile.picture || null,
  };
}

export function createIdentityClient({
  identityApi = globalThis.chrome?.identity,
  fetchImpl = globalThis.fetch,
} = {}) {
  return {
    async signIn() {
      if (!identityApi || typeof identityApi.getAuthToken !== "function") {
        return failure(
          "auth_error",
          "Google sign-in is unavailable for this extension.",
        );
      }

      let token;
      try {
        const tokenResult = await identityApi.getAuthToken({
          interactive: true,
        });
        token =
          typeof tokenResult === "string" ? tokenResult : tokenResult?.token;
        if (typeof token !== "string" || token === "") {
          return failure("auth_error", "Google did not return an access token.");
        }
      } catch (error) {
        if (isUserCancellation(error)) {
          return failure("auth_cancelled", "Google sign-in was canceled.");
        }
        return failure("auth_error", "Google sign-in failed.");
      }

      try {
        const response = await fetchImpl(USER_INFO_URL, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          return failure(
            "profile_error",
            "Google could not return the signed-in profile.",
          );
        }

        const profile = parseGoogleProfile(await response.json());
        if (!profile) {
          return failure(
            "bad_response",
            "Google returned an invalid profile.",
          );
        }

        return { ok: true, data: profile };
      } catch {
        return failure(
          "profile_error",
          "Could not return the Google profile.",
        );
      }
    },
  };
}
