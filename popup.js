// popup.js
const wavButton = document.getElementById('downloadWav');
const mp3Button = document.getElementById('downloadMp3');
const statusDiv = document.getElementById('status');

function setStatus(text, isError = false) {
  statusDiv.textContent = text;
  statusDiv.style.color = isError ? 'red' : '#333';
}

function setLoadingState(isLoading) {
  wavButton.disabled = isLoading;
  mp3Button.disabled = isLoading;
}

function scrapeSongs() {
  console.log("Scraping page for song links...");
  const songLinks = document.querySelectorAll("a[href*='/song/']");
  if (!songLinks || songLinks.length === 0) {
    return [];
  }

  // Use a Map to filter out duplicate URLs, keeping only the first instance
  const uniqueSongs = new Map();
  Array.from(songLinks).forEach(a => {
    const href = a.href;
    // --- NEW DEBUGGING LOG ---
    console.log('Found link:', { text: a.textContent.trim(), href: href });
    if (!uniqueSongs.has(href)) {
        const parts = href.split('/song/');
        if (parts.length < 2) return;
        const id = parts[1].split('/')[0];
        const name = a.textContent.trim().replace(/[\/\\:*?"<>|]/g, '-');
        // This check correctly filters out links with no name
        if (id && name) {
            uniqueSongs.set(href, { id, name });
        }
    }
  });
  
  const songs = Array.from(uniqueSongs.values());
  console.log(`Found ${songs.length} unique songs.`, songs);
  return songs;
}

async function startDownload(format) {
  setLoadingState(true);
  setStatus(`Scanning page for songs...`);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab.url || !(tab.url.includes('suno.com') || tab.url.includes('app.suno.ai'))) {
     setStatus('Error: Please open a Suno page.', true);
     setLoadingState(false);
     return;
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeSongs
    });
    const songs = results[0].result;
    if (!songs || songs.length === 0) {
      setStatus('No songs found on this page.', true);
      setLoadingState(false);
      return;
    }

    setStatus(`Found ${songs.length} songs. Starting...`);
    chrome.runtime.sendMessage({
      action: 'startDownload',
      payload: { songs, format, tabId: tab.id }
    });
  } catch (e) {
    console.error("Error starting download process:", e);
    setStatus('An error occurred. Check console.', true);
    setLoadingState(false);
  }
}

wavButton.addEventListener('click', () => startDownload('wav'));
mp3Button.addEventListener('click', () => startDownload('mp3'));

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'updateStatus') {
    setStatus(message.payload.text);
  } else if (message.action === 'downloadComplete') {
    setLoadingState(false);
    setStatus(message.payload.text);
  }
});