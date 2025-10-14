// wav-downloader.js

// This small function is injected into the page to trigger the WAV conversion.
function triggerWavConversion(clipId) {
  // This event is heard by injected.js
  window.dispatchEvent(new CustomEvent('SunoTriggerWavConversion', {
    detail: { clipId }
  }));
}

// Reusable function to convert a file blob to a downloadable data: URL.
function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// This function attempts to download a file and returns true on success, false on failure.
async function attemptDownload(url, fileName) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Attempt failed for ${fileName}. Status: ${response.status}`);
      return false; // Indicate failure
    }
    const blob = await response.blob();
    const dataUrl = await blobToDataURL(blob);
    chrome.downloads.download({
      url: dataUrl,
      filename: fileName,
      conflictAction: 'uniquify'
    });
    return true; // Indicate success
  } catch (error) {
    console.error(`Download fetch failed for ${fileName}:`, error);
    return false; // Indicate failure
  }
}

// The main exported function, updated with the proven retry logic.
export async function downloadWav(song, tabId, settings, workspaceName) {
  const { id: uuid, name: title } = song;
  const cdnUrl = `https://cdn1.suno.ai/${uuid}.wav`;
  const baseWavFilename = settings.includeUuid ? `${title} - ${uuid}.wav` : `${title}.wav`;
  let finalWavFilename = baseWavFilename;
  if (settings.createSubfolder && workspaceName) {
      finalWavFilename = `SUNO_${workspaceName}/${baseWavFilename}`;
  }

  try {
    // Step 1: Trigger the WAV conversion on the server.
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: triggerWavConversion,
      args: [uuid]
    });

    // Step 2: Start the retry loop to download the file directly from the CDN.
    let downloaded = false;
    const maxRetries = 4;
    const retryDelay = 4000; // 4 seconds

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        console.log(`[WAV] Attempt ${attempt}/${maxRetries} for "${title}": Waiting ${retryDelay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        
        downloaded = await attemptDownload(cdnUrl, finalWavFilename);
        
        if (downloaded) {
            console.log(`[WAV] ✅ Success! Download initiated for "${title}".`);
            break; // Exit the retry loop
        } else {
            console.log(`[WAV] File not ready on attempt ${attempt}.`);
        }
    }

    if (!downloaded) {
        throw new Error(`Skipped after ${maxRetries} failed attempts.`);
    }

    // If WAV download was successful, download the image.
    if (settings.includeJpeg) {
      const baseImageFilename = settings.includeUuid ? `${title} - ${uuid}.jpeg` : `${title}.jpeg`;
      let finalImageFilename = baseImageFilename;
      if (settings.createSubfolder && workspaceName) {
        finalImageFilename = `SUNO_${workspaceName}/${baseImageFilename}`;
      }
      // Use the same robust download function for the image
      await attemptDownload(`https://cdn2.suno.ai/image_large_${uuid}.jpeg`, finalImageFilename);
    }
  } catch (error) {
    console.error(`[WAV] Failed to download "${title}":`, error.message);
    chrome.runtime.sendMessage({
      action: 'updateStatus',
      payload: { text: `Failed: ${title}` }
    });
  }
}

