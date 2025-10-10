// wav-downloader.js

function triggerWavConversion(clipId) {
  window.dispatchEvent(new CustomEvent('SunoTriggerWavConversion', { detail: { clipId } }));
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
    if (!response.ok) return;
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
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: triggerWavConversion,
      args: [uuid]
    });
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Filename logic
    const baseWavFilename = settings.includeUuid ? `${title} - ${uuid}.wav` : `${title}.wav`;
    let finalWavFilename = baseWavFilename;
     if (settings.createSubfolder && workspaceName) {
        // MODIFIED: Changed from suffix to prefix
        finalWavFilename = `SUNO_${workspaceName}/${baseWavFilename}`;
    }
    await forceDownload(`https://cdn1.suno.ai/${uuid}.wav`, finalWavFilename);

    // Image download logic
    if (settings.includeJpeg) {
      const baseImageFilename = settings.includeUuid ? `${title} - ${uuid}.jpeg` : `${title}.jpeg`;
      let finalImageFilename = baseImageFilename;
       if (settings.createSubfolder && workspaceName) {
        // MODIFIED: Changed from suffix to prefix
        finalImageFilename = `SUNO_${workspaceName}/${baseImageFilename}`;
      }
      await forceDownload(`https://cdn2.suno.ai/image_large_${uuid}.jpeg`, finalImageFilename);
    }
  } catch (error) {
    console.error(`[WAV] Failed to download "${title}":`, error);
    chrome.runtime.sendMessage({
      action: 'updateStatus',
      payload: { text: `Failed: ${title}` }
    });
  }
}