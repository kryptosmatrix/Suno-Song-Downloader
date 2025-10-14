// This script only handles triggering the WAV conversion.

async function getAuthToken() {
  try {
    if (window.Clerk?.session) return await window.Clerk.session.getToken();
  } catch (e) { /* silent */ }
  const cookie = document.cookie.split('; ').find(c => c.startsWith('__session='));
  return cookie ? cookie.split('=')[1] : null;
}

// This function just sends the POST request.
async function triggerConversion(clipId) {
  const authToken = await getAuthToken();
  if (!authToken) {
    console.error("Injected: No auth token found for WAV conversion.");
    return;
  }
  const base = "https://studio-api.prod.suno.ai/api/gen/";
  await fetch(`${base}${clipId}/convert_wav/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken}` }
  }).catch((e) => {
    console.error("Injected: Triggering conversion failed.", e);
  });
}

// Listen for the trigger request from wav-downloader.js
window.addEventListener("SunoTriggerWavConversion", async (event) => {
  const { clipId } = event.detail || {};
  if (!clipId) return;
  await triggerConversion(clipId);
});

