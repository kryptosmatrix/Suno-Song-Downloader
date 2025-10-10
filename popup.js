// popup.js
const wavButton = document.getElementById('downloadWav');
const mp3Button = document.getElementById('downloadMp3');
const stopButton = document.getElementById('stopBtn');
const statusDiv = document.getElementById('status');

// Get all settings elements
const createSubfolderCheckbox = document.getElementById('createSubfolder');
const includeJpegCheckbox = document.getElementById('includeJpeg');
const includeUuidCheckbox = document.getElementById('includeUuid');
const delayInput = document.getElementById('delaySeconds');

// --- Settings Management ---
function saveSettings() {
  const settings = {
    delay: parseInt(delayInput.value, 10) || 3,
    createSubfolder: createSubfolderCheckbox.checked,
    includeJpeg: includeJpegCheckbox.checked,
    includeUuid: includeUuidCheckbox.checked,
  };
  chrome.storage.sync.set({ settings });
}

function loadSettings() {
  const defaultSettings = {
      delay: 3,
      createSubfolder: true,
      includeJpeg: true,
      includeUuid: true,
  };
  chrome.storage.sync.get({ settings: defaultSettings }, (data) => {
    delayInput.value = data.settings.delay;
    createSubfolderCheckbox.checked = data.settings.createSubfolder;
    includeJpegCheckbox.checked = data.settings.includeJpeg;
    includeUuidCheckbox.checked = data.settings.includeUuid;
  });
}

// Add event listeners for all settings
delayInput.addEventListener('change', saveSettings);
createSubfolderCheckbox.addEventListener('change', saveSettings);
includeJpegCheckbox.addEventListener('change', saveSettings);
includeUuidCheckbox.addEventListener('change', saveSettings);

// --- State Management and UI Updates ---
function setStatus(text, isError = false) {
  statusDiv.textContent = text;
  statusDiv.style.color = isError ? 'red' : '#333';
}

function setLoadingState(isLoading, statusText = '') {
  wavButton.disabled = isLoading;
  mp3Button.disabled = isLoading;
  stopButton.style.display = isLoading ? 'block' : 'none';
  if (statusText) setStatus(statusText);
}

function scrapeSongs() {
  const songListContainer = document.querySelector('div[class*="content-container"]');
  const searchRoot = songListContainer || document;
  const songLinks = searchRoot.querySelectorAll("a[href*='/song/']");
  if (!songLinks || songLinks.length === 0) return [];
  const uniqueSongs = new Map();
  Array.from(songLinks).forEach(a => {
    const href = a.href;
    if (!uniqueSongs.has(href)) {
        const parts = href.split('/song/');
        if (parts.length < 2) return;
        const id = parts[1].split('/')[0];
        const name = a.textContent.trim().replace(/[\/\\:*?"<>|]/g, '-');
        if (id && name) uniqueSongs.set(href, { id, name });
    }
  });
  return Array.from(uniqueSongs.values());
}

function scrapeWorkspaceName() {
  const selector = 'div.css-9rwmp5.e1wyop193';
  const element = document.querySelector(selector);
  if (element && element.textContent) {
    return element.textContent.trim().replace(/[\/\\:*?"<>|]/g, '-');
  }
  return 'Suno Downloads';
}

async function startDownload(format) {
  setLoadingState(true, `Scanning page...`);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.url || !(tab.url.includes('suno.com') || tab.url.includes('app.suno.ai'))) {
     setStatus('Error: Please open a Suno page.', true);
     setLoadingState(false, '');
     return;
  }
  try {
    const songResults = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: scrapeSongs });
    const songs = songResults[0].result;
    if (!songs || songs.length === 0) {
      setStatus('No songs found.', true);
      setLoadingState(false, '');
      return;
    }
    const workspaceResults = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: scrapeWorkspaceName });
    const workspaceName = workspaceResults[0].result;
    
    setStatus(`Found ${songs.length} songs. Starting...`);
    const settings = {
      delay: parseInt(delayInput.value, 10) || 3,
      createSubfolder: createSubfolderCheckbox.checked,
      includeJpeg: includeJpegCheckbox.checked,
      includeUuid: includeUuidCheckbox.checked,
    };
    chrome.runtime.sendMessage({
      action: 'startDownload',
      payload: { songs, format, tabId: tab.id, settings, workspaceName }
    });
  } catch (e) {
    console.error("Error starting download process:", e);
    setStatus('An error occurred. Check console.', true);
    setLoadingState(false, '');
  }
}

stopButton.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'stopDownload' });
  setStatus('Stopping...');
});

wavButton.addEventListener('click', () => startDownload('wav'));
mp3Button.addEventListener('click', () => startDownload('mp3'));

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  chrome.runtime.sendMessage({ action: 'getDownloadState' });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'updateStatus') {
    setLoadingState(true, message.payload.text);
  } else if (message.action === 'downloadComplete') {
    setLoadingState(false, message.payload.text);
  } else if (message.action === 'stateUpdate') {
    const state = message.payload;
    if (state.inProgress) {
      setLoadingState(true, state.text);
    }
  }
});