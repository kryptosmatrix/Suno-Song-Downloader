// mp3-downloader.js

// A new helper function to convert a Blob into a more reliable data: URL
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
    
    // Convert the blob to a data: URL instead of a blob: URL
    const dataUrl = await blobToDataURL(blob);

    chrome.downloads.download({
      url: dataUrl, // Use the new data: URL
      filename: fileName,
      conflictAction: 'uniquify'
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error(`Chrome Download API failed for "${fileName}":`, chrome.runtime.lastError.message);
      } else {
        if (downloadId) {
          console.log(`Download successfully queued for "${fileName}" with ID: ${downloadId}`);
        } else {
          console.warn(`Download for "${fileName}" was initiated but did not return a download ID.`);
        }
      }
    });
    
  } catch (error) {
    console.error(`Download failed for "${fileName}:`, error);
  }
}

export async function downloadMp3(song) {
  const { id: uuid, name: title } = song;
  console.log(`[MP3 Downloader] Processing: ${title}`);

  const mp3Url = `https://cdn1.suno.ai/${uuid}.mp3`;
  const imageUrl = `https://cdn2.suno.ai/image_large_${uuid}.jpeg`;
  const mp3Filename = `${title} - ${uuid}.mp3`;
  const imageFilename = `${title} - ${uuid}.jpeg`;

  await forceDownload(mp3Url, mp3Filename);
  await forceDownload(imageUrl, imageFilename);
}