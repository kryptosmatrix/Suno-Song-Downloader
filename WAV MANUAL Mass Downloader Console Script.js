// --- Start of WAV Mass Downloader Console Script ---

async function massDownloadWavsWithRetries() {
    console.log('🚀 Starting Mass WAV Downloader Script...');

    // --- USER CONFIGURATION ---
    const DOWNLOAD_JPEG = true; // Set to false to skip downloading cover art
    // --- END USER CONFIGURATION ---

    // --- Reusable Helper Functions ---

    // Gets the authentication token from the page
    async function getAuthToken() {
        try {
            if (window.Clerk?.session) return await window.Clerk.session.getToken();
        } catch (e) { /* silent */ }
        const cookie = document.cookie.split('; ').find(c => c.startsWith('__session='));
        return cookie ? cookie.split('=')[1] : null;
    }

    // Fetches a URL and triggers a download
    async function forceDownload(url, fileName) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                // Return false on failure to allow for retries or skipping
                console.warn(`Could not fetch ${fileName}. It might not exist. Status: ${response.status}`);
                return false;
            }
            const blob = await response.blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(a.href);
            return true; // Return true on success
        } catch (error) {
            console.error(`Download fetch failed for ${fileName}:`, error);
            return false;
        }
    }

    // --- Main Logic ---

    // 1. Get the auth token once at the start.
    const authToken = await getAuthToken();
    if (!authToken) {
        alert('❌ Authentication failed. Please make sure you are logged in to Suno.');
        return; // This stops the script
    }
    console.log('🔑 Auth token secured.');

    // 2. Find all unique songs on the page.
    const songListContainer = document.querySelector('div[role="rowgroup"]');
    if (!songListContainer) {
        alert('❌ Could not find the main song list container on the page.');
        return; // This stops the script
    }
    const songLinks = songListContainer.querySelectorAll('a[href*="/song/"]');
    const uniqueSongs = new Map();
    Array.from(songLinks).forEach(a => {
        const href = a.href;
        if (!uniqueSongs.has(href)) {
            const id = href.split('/song/')[1]?.split('/')[0];
            const name = a.textContent.trim().replace(/[\/\\:*?"<>|]/g, '-');
            if (id && name) uniqueSongs.set(href, { id, name });
        }
    });
    const songsToDownload = Array.from(uniqueSongs.values());

    if (songsToDownload.length === 0) {
        alert('No songs found to download.');
        return; // This stops the script
    }
    console.log(`🎵 Found ${songsToDownload.length} unique songs. Starting process...`);

    // 3. Loop through each song.
    for (let i = 0; i < songsToDownload.length; i++) {
        const song = songsToDownload[i];
        const progress = `(${i + 1}/${songsToDownload.length})`;
        console.log(`--- ${progress} Processing: "${song.name}" ---`);

        // A small delay between triggering each song to be polite
        await new Promise(resolve => setTimeout(resolve, 500));

        // 4. Trigger the WAV conversion for the current song.
        try {
            console.log(`   - Triggering conversion request...`);
            await fetch(`https://studio-api.prod.suno.com/api/gen/${song.id}/convert_wav/`, {
                method: "POST",
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
        } catch (e) {
            console.error(`   - Error sending conversion request. Skipping song.`, e);
            continue; // Skip to the next song
        }

        // 5. Start the retry loop to download the file.
        let downloaded = false;
        for (let attempt = 1; attempt <= 4; attempt++) {
            console.log(`   - Attempt ${attempt}/4: Waiting 4 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 4000));

            const cdnUrl = `https://cdn1.suno.ai/${song.id}.wav`;
            const filename = `${song.name} - ${song.id}.wav`;
            
            downloaded = await forceDownload(cdnUrl, filename);
            
            if (downloaded) {
                console.log(`   - ✅ Success! WAV download initiated.`);
                
                // --- NEW: Download JPEG if enabled ---
                if (DOWNLOAD_JPEG) {
                    console.log(`   - Downloading cover art...`);
                    const imageUrl = `https://cdn2.suno.ai/image_large_${song.id}.jpeg`;
                    const imageFilename = `${song.name} - ${song.id}.jpeg`;
                    await forceDownload(imageUrl, imageFilename);
                }
                // --- END NEW ---

                break; // Exit the retry loop for this song
            } else {
                console.log(`   - File not ready on attempt ${attempt}.`);
            }
        }

        if (!downloaded) {
            console.error(`   - ❌ Skipped "${song.name}" after 4 failed attempts.`);
        }
    }

    // 6. Show the final confirmation and then stop.
    console.log('🎉 --- All songs processed. ---');
    alert(`Finished processing all ${songsToDownload.length} songs!`);
}

// Run the script
massDownloadWavsWithRetries();

// --- End of WAV Mass Downloader Console Script ---

