// wav-downloader.js

function triggerWavConversion(clipId) {
  window.dispatchEvent(new CustomEvent('SunoTriggerWavConversion', {
    detail: { clipId }
  }));
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
      console.warn(`Could not fetch ${fileName}. It might not exist. Status: ${response.status}`);
      return;
    }
    const blob = await response.blob();
    const dataUrl = await blobToDataURL(blob);

    chrome.downloads.download({
      url: dataUrl,
      filename: fileName,
      conflictAction: 'uniquify'
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error(`Download API failed for "${fileName}":`, chrome.runtime.lastError.message);
      }
    });
  } catch (error) {
    console.error(`Download failed for "${fileName}:`, error);
  }
}

export async function downloadWav(song, tabId) {
  const { id: uuid, name: title } = song;
  
  try {
    // Step 1: Trigger the WAV conversion on the server.
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: triggerWavConversion,
      args: [uuid]
    });

    // Step 2: Wait a few seconds for the server to process.
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Step 3: Download the WAV and the Image directly from the CDN.
    const wavUrl = `https://cdn1.suno.ai/${uuid}.wav`;
    const imageUrl = `https://cdn2.suno.ai/image_large_${uuid}.jpeg`;
    const wavFilename = `${title} - ${uuid}.wav`;
    const imageFilename = `${title} - ${uuid}.jpeg`;

    await forceDownload(wavUrl, wavFilename);
    await forceDownload(imageUrl, imageFilename);

  } catch (error) {
    console.error(`[WAV] Failed to download "${title}":`, error);
    chrome.runtime.sendMessage({
      action: 'updateStatus',
      payload: { text: `Failed: ${title}` }
    });
  }
}