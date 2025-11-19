const wavButton = document.getElementById('downloadWav');
const mp3Button = document.getElementById('downloadMp3');
const copyScriptBtn = document.getElementById('copyScriptBtn'); // New Button
const stopButton = document.getElementById('stopBtn');
const statusDiv = document.getElementById('status');

const createSubfolderCheckbox = document.getElementById('createSubfolder');
const includeJpegCheckbox = document.getElementById('includeJpeg');
const includeUuidCheckbox = document.getElementById('includeUuid');
const delayInput = document.getElementById('delaySeconds');

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
  const defaultSettings = { delay: 3, createSubfolder: true, includeJpeg: true, includeUuid: true };
  chrome.storage.sync.get({ settings: defaultSettings }, (data) => {
    delayInput.value = data.settings.delay;
    createSubfolderCheckbox.checked = data.settings.createSubfolder;
    includeJpegCheckbox.checked = data.settings.includeJpeg;
    includeUuidCheckbox.checked = data.settings.includeUuid;
  });
}

[delayInput, createSubfolderCheckbox, includeJpegCheckbox, includeUuidCheckbox].forEach(el => el.addEventListener('change', saveSettings));

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

// --- NEW: Logic to fetch and copy the script file ---
copyScriptBtn.addEventListener('click', async () => {
  try {
    // Fetch the file content from the extension package
    const response = await fetch('wav-mass-downloader-v2.js');
    if (!response.ok) throw new Error('Script file not found.');
    
    const scriptText = await response.text();
    
    // Write to clipboard
    await navigator.clipboard.writeText(scriptText);
    
    // Visual Feedback
    const originalText = copyScriptBtn.textContent;
    copyScriptBtn.textContent = 'Script Copied! 📋';
    copyScriptBtn.style.background = '#4caf50';
    
    setTimeout(() => {
      copyScriptBtn.textContent = originalText;
      copyScriptBtn.style.background = '#9c27b0';
    }, 2000);
    
    setStatus('Script copied to clipboard.');
  } catch (err) {
    console.error('Failed to copy script:', err);
    setStatus('Error: Could not read script file.', true);
  }
});
// --- END NEW ---


function scrapeSongs() {
  const songListContainer = document.querySelector('div[role="rowgroup"]');
  const searchRoot = songListContainer || document;

  const songLinks = searchRoot.querySelectorAll("a[href*='/song/']");
  if (!songLinks || songLinks.length === 0) return [];
  
  const uniqueSongs = new Map();
  Array.from(songLinks).forEach(a => {
    const href = a.href;
    if (!uniqueSongs.has(href)) {
        const id = href.split('/song/')[1]?.split('/')[0];
        const name = a.textContent?.trim().replace(/[\/\\:*?"<>|]/g, '-');
        if (id && name) uniqueSongs.set(href, { id, name });
    }
  });
  return Array.from(uniqueSongs.values());
}

function scrapeWorkspaceName() {
  // Updated to the correct selector
  const selector = 'div.css-55xecx.e1sz90n63';
  const element = document.querySelector(selector);
  return element?.textContent?.trim().replace(/[\/\\:*?"<>|]/g, '-') || 'Suno Downloads';
}

async function startDownload(format) {
  setLoadingState(true, `Scanning page...`);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.url || !tab.url.startsWith('https://suno.com')) {
     setStatus('Error: Not on a Suno page.', true);
     setLoadingState(false, '');
     return;
  }
  try {
    const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: scrapeSongs });
    const songs = results[0].result;
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
    console.error("Error starting download:", e);
    setStatus('An error occurred.', true);
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
  chrome.runtime.sendMessage({ action: 'getDownloadState' }, (state) => {
    if (chrome.runtime.lastError) return; 
    if (state && state.inProgress) {
      setLoadingState(true, state.text);
    }
  });
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