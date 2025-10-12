function getWavUrlFromPage(clipId) {
  return new Promise((resolve) => {
    const listener = (event) => {
      if (event.detail.clipId === clipId) {
        window.removeEventListener('SunoGetWavUrlResponse', listener);
        resolve(event.detail);
      }
    };
    window.addEventListener('SunoGetWavUrlResponse', listener);
    window.dispatchEvent(new CustomEvent('SunoGetWavUrlRequest', {
      detail: { clipId }
    }));
  });
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function forceDownload(url, fileName) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Could not fetch ${fileName}. Status: ${response.status}`);
      return;
    }
    const blob = await response.blob();
    const dataUrl = await blobToDataURL(blob);
    chrome.downloads.download({
      url: dataUrl,
      filename: fileName,
      conflictAction: 'uniquify'
    }, (downloadId) => {
      if (chrome.runtime.lastError) console.error(`Download API failed for "${fileName}":`, chrome.runtime.lastError.message);
    });
  } catch (error) {
    console.error(`Download failed for ${fileName}:`, error);
  }
}

export async function downloadWav(song, tabId, settings, workspaceName) {
  const { id: uuid, name: title } = song;
  
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: getWavUrlFromPage,
      args: [uuid]
    });

    const response = results[0].result;
    if (!response || !response.success || !response.url) {
      throw new Error(response?.error || `Failed to get final WAV URL from page.`);
    }
    
    const wavUrl = response.url;
    const baseWavFilename = settings.includeUuid ? `${title} - ${uuid}.wav` : `${title}.wav`;
    let finalWavFilename = baseWavFilename;
    if (settings.createSubfolder && workspaceName) {
        finalWavFilename = `SUNO_${workspaceName}/${baseWavFilename}`;
    }
    await forceDownload(wavUrl, finalWavFilename);

    if (settings.includeJpeg) {
      const baseImageFilename = settings.includeUuid ? `${title} - ${uuid}.jpeg` : `${title}.jpeg`;
      let finalImageFilename = baseImageFilename;
      if (settings.createSubfolder && workspaceName) {
        finalImageFilename = `SUNO_${workspaceName}/${baseImageFilename}`;
      }
      await forceDownload(`https://cdn2.suno.ai/image_large_${uuid}.jpeg`, finalImageFilename);
    }
  } catch (error) {
    console.error(`[WAV] Failed to download "${title}":`, error, error.stack);
    chrome.runtime.sendMessage({
      action: 'updateStatus',
      payload: { text: `Failed: ${title}` }
    });
  }
}

