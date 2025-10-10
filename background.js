// background.js
import { downloadMp3 } from './mp3-downloader.js';
import { downloadWav } from './wav-downloader.js';

let downloadState = {
  inProgress: false,
  total: 0,
  current: 0,
  text: ''
};

let isStopRequested = false;

// This function is for the mass downloader (from the popup)
async function processQueue(queue, tabId, settings, workspaceName) {
  isStopRequested = false;
  downloadState.inProgress = true;
  downloadState.total = queue.length;

  for (let i = 0; i < queue.length; i++) {
    if (isStopRequested) {
      downloadState.inProgress = false;
      chrome.runtime.sendMessage({ action: 'downloadComplete', payload: { text: `Download stopped.` } });
      break;
    }
    
    downloadState.current = i + 1;
    const currentSong = queue[i];
    downloadState.text = `Downloading ${currentSong.name} (${downloadState.current}/${downloadState.total})...`;
    chrome.runtime.sendMessage({ action: 'updateStatus', payload: { text: downloadState.text } });
    
    if (currentSong.format === 'mp3') {
      await downloadMp3(currentSong, settings, workspaceName);
    } else if (currentSong.format === 'wav') {
      await downloadWav(currentSong, tabId, settings, workspaceName);
    }

    const userDelaySeconds = settings.delay && !isNaN(settings.delay) ? settings.delay : 3;
    const delayMilliseconds = userDelaySeconds * 1000;
    if (delayMilliseconds > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMilliseconds));
    }
  }
  
  if (!isStopRequested) {
    downloadState.inProgress = false;
    chrome.runtime.sendMessage({ action: 'downloadComplete', payload: { text: `Finished ${downloadState.total} downloads.` } });
  }
}

// The main message listener
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.action === 'startDownload') {
    const { songs, format, tabId, settings, workspaceName } = message.payload;
    const queue = songs.map(song => ({ ...song, format }));
    processQueue(queue, tabId, settings, workspaceName);
  } else if (message.action === 'stopDownload') {
    isStopRequested = true;
  } else if (message.action === 'getDownloadState') {
    if (sender.url && sender.url.includes('popup.html')) {
        chrome.runtime.sendMessage({ action: 'stateUpdate', payload: downloadState });
    }
  } 
  // --- NEW: Handle single manual downloads ---
  else if (message.action === 'manualDownload') {
    const { song, format, settings, workspaceName } = message.payload;
    const tabId = sender.tab.id; // Get the tabId from the message sender
    if (format === 'mp3') {
        downloadMp3(song, settings, workspaceName);
    } else if (format === 'wav') {
        downloadWav(song, tabId, settings, workspaceName);
    }
  }
  return true;
});