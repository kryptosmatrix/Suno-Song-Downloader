// --- WAV Mass Downloader V2: Async Convert + Parallel Downloads ---
// STRICT CLEAN MODE: Filenames are strictly "Name - ID.wav"
// No folders, no workspaces, no prefixes.

(async function () {
    console.log("🚀 Starting STRICT CLEAN V2 (No Folders)...");

    // --- CONFIGURATION ---
    const DOWNLOAD_JPEG = true;      // Set to true to download cover art
    
    const CONVERT_INTERVAL = 1200;   // Time between firing conversion requests (1.2s)
    const FIRST_DOWNLOAD_DELAY = 6000; // Wait 6s before first download attempt
    const RETRY_DELAY = 3000;        // Wait 3s between retries
    const MAX_RETRIES = 10;          // Stop trying after ~30 seconds
    // ---------------------

    // --- Helper functions ---

    async function getAuthToken() {
        try {
            if (window.Clerk?.session) return await window.Clerk.session.getToken();
        } catch {}
        const cookie = document.cookie.split("; ").find(c => c.trim().startsWith("__session="));
        return cookie ? cookie.split("=")[1].trim() : null;
    }

    async function forceDownload(url, fileName) {
        try {
            const res = await fetch(url);
            if (!res.ok) return false;
            const blob = await res.blob();
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(a.href);
            return true;
        } catch {
            return false;
        }
    }

    function delay(ms) {
        return new Promise(res => setTimeout(res, ms));
    }

    // --- Main Execution ---

    const authToken = await getAuthToken();
    if (!authToken) {
        alert("❌ Not logged in!");
        return;
    }

    // 1. Collect Songs
    const container = document.querySelector('div[role="rowgroup"]');
    const links = container?.querySelectorAll('a[href*="/song/"]') || [];
    const unique = new Map();

    links.forEach(a => {
        const id = a.href.split("/song/")[1]?.split("/")[0];
        // Sanitize filename to remove characters that are invalid in file systems
        const name = a.textContent.trim().replace(/[\/\\:*?"<>|]/g, "-");
        if (id && name && !unique.has(id)) unique.set(id, { id, name });
    });

    const songs = [...unique.values()];
    if (songs.length === 0) {
        alert("No songs found!");
        return;
    }
    console.log(`🎵 Queued ${songs.length} songs for processing.`);

    // --- Parallel Download Logic ---

    async function startDownloadPipeline(song) {
        // STRICT FILENAME FORMAT
        // Just "Song Name - ID.wav"
        let wavFile = `${song.name} - ${song.id}.wav`;
        let jpgFile = `${song.name} - ${song.id}.jpeg`;

        console.log(`    ⏳ [${song.name}] Pipeline started. Waiting for generation...`);
        await delay(FIRST_DOWNLOAD_DELAY);

        const wavUrl = `https://cdn1.suno.ai/${song.id}.wav`;
        let attempts = 0;

        while (attempts < MAX_RETRIES) {
            attempts++;
            const ok = await forceDownload(wavUrl, wavFile);
            
            if (ok) {
                console.log(`    ✅ [${song.name}] WAV Downloaded.`);
                
                if (DOWNLOAD_JPEG) {
                    const jpgUrl = `https://cdn2.suno.ai/image_large_${song.id}.jpeg`;
                    await forceDownload(jpgUrl, jpgFile);
                }
                return; // Done with this song
            }

            console.log(`    🔄 [${song.name}] Not ready. Retry ${attempts}/${MAX_RETRIES}...`);
            await delay(RETRY_DELAY);
        }

        console.error(`    ❌ [${song.name}] Timed out after ${MAX_RETRIES} attempts.`);
    }

    // --- Conversion Queue (The "Ticker") ---

    let index = 0;

    async function conversionQueue() {
        if (index >= songs.length) {
            console.log("🎉 All conversion requests sent. Downloads continuing in background...");
            return;
        }

        const song = songs[index];
        console.log(`🚀 [${index + 1}/${songs.length}] Triggering: ${song.name}`);

        // Fire and forget conversion request
        fetch(`https://studio-api.prod.suno.com/api/gen/${song.id}/convert_wav/`, {
            method: "POST",
            headers: { Authorization: `Bearer ${authToken}` }
        }).catch(() => console.warn(`Trigger warning for ${song.name}`));

        // Start the download listener for this song in parallel
        startDownloadPipeline(song);

        index++;
        // Schedule next conversion trigger
        setTimeout(conversionQueue, CONVERT_INTERVAL);
    }

    // Start the machine
    conversionQueue();

})();