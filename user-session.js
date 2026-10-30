async function sendUserSessionMessage(type, payload) {
  const response = await chrome.runtime.sendMessage({ type, payload });
  if (!response || response.type !== "COOKS_USER_SESSION_RESULT") {
    throw new Error("The user session request could not be completed.");
  }
  if (response.error) {
    throw new Error(response.error.message);
  }
  return response.payload;
}

globalThis.CooksUserSession = {
  async signIn(profile) {
    const result = await sendUserSessionMessage("COOKS_SIGN_IN", { profile });
    return result.profile;
  },

  async getCurrentUser() {
    const result = await sendUserSessionMessage("COOKS_GET_CURRENT_USER");
    return result.userId;
  },

  async signOut() {
    await sendUserSessionMessage("COOKS_SIGN_OUT");
  },
};
