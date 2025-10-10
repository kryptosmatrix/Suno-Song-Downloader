// injected.js

async function getAuthToken() {
  try {
    if (window.Clerk?.session) {
      const token = await window.Clerk.session.getToken();
      if (token) return token;
    }
  } catch (e) {
    console.error("Injected: Failed to get Clerk token", e);
  }
  const cookie = document.cookie
    .split(";")
    .find(c => c.trim().startsWith("__session="));
  return cookie ? cookie.split("=")[1].trim() : null;
}

async function triggerConversion(clipId) {
  const token = await getAuthToken();
  if (!token) {
    console.error("Injected: No auth token found for WAV conversion.");
    return;
  }
  const base = "https://studio-api.prod.suno.ai/api/gen/";
  await fetch(`${base}${clipId}/convert_wav/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  }).catch((e) => {
    console.error("Injected: Triggering conversion failed.", e);
  });
}

// New, simpler event listener for WAV conversion.
window.addEventListener("SunoTriggerWavConversion", async (event) => {
  const { clipId } = event.detail || {};
  if (!clipId) return;
  await triggerConversion(clipId);
});