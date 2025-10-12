async function getAuthToken() {
  try {
    if (window.Clerk?.session) {
      const token = await window.Clerk.session.getToken();
      if (token) return token;
    }
  } catch (e) {
    // Fail silently
  }
  const cookie = document.cookie.split("; ").find(c => c.trim().startsWith("__session="));
  return cookie ? cookie.split("=")[1].trim() : null;
}

async function convertAndFetchWavUrl(clipId) {
  const token = await getAuthToken();
  if (!token) return { success: false, error: "No auth token" };

  const base = "https://studio-api.prod.suno.com/api/gen/";
  
  await fetch(`${base}${clipId}/convert_wav/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  }).catch(() => {});

  const startTime = Date.now();
  while (Date.now() - startTime < 60000) {
    try {
        const res = await fetch(`${base}${clipId}/wav_file/`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          const url = data?.url || data?.wav_url || data?.audio_url;
          if (url) return { success: true, url };
        }
    } catch (_) {}
    await new Promise(r => setTimeout(r, 2000));
  }
  return { success: false, error: "Polling for WAV URL timed out." };
}

window.addEventListener("SunoGetWavUrlRequest", async (event) => {
  const { clipId } = event.detail || {};
  if (!clipId) return;
  const result = await convertAndFetchWavUrl(clipId);
  window.dispatchEvent(new CustomEvent("SunoGetWavUrlResponse", {
    detail: { clipId, ...result }
  }));
});

