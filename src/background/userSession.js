export const ANONYMOUS_USER = "anonymous";

const PROFILE_KEY = "userProfile";
const SESSION_MARKER_KEY = "sessionMarker";

export function createUserSession(storage) {
  return {
    async signIn(profile) {
      if (
        profile === null ||
        typeof profile !== "object" ||
        Array.isArray(profile) ||
        typeof profile.userId !== "string" ||
        profile.userId.trim() === ""
      ) {
        throw new TypeError("A user profile with a non-empty userId is required.");
      }

      const userProfile = { ...profile, userId: profile.userId.trim() };
      await storage.set({
        [PROFILE_KEY]: userProfile,
        [SESSION_MARKER_KEY]: true,
      });
      return userProfile;
    },

    async getCurrentUser() {
      const stored = await storage.get([PROFILE_KEY, SESSION_MARKER_KEY]);
      if (
        stored[SESSION_MARKER_KEY] !== true ||
        typeof stored[PROFILE_KEY]?.userId !== "string" ||
        stored[PROFILE_KEY].userId.trim() === ""
      ) {
        return ANONYMOUS_USER;
      }

      return stored[PROFILE_KEY].userId;
    },

    async signOut() {
      await storage.clear();
    },
  };
}
