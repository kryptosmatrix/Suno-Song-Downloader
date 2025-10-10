// background.js
import { downloadMp3 } from './mp3-downloader.js';
import { downloadWav } from './wav-downloader.js';

console.log("background.js: Service worker started.");

async function processQueue(queue, tabId) {
  console.log(`background.js: Starting to process a queue of ${queue.length} songs.`);
  const total = queue.length;

  for (let i = 0; i < queue.length; i++) {
    const song = queue[i];
    const progress = `(${i + 1}/${total})`;
    console.log(`background.js: Processing song ${progress}: "${song.name}"`);

    chrome.runtime.sendMessage({
      action: 'updateStatus',
      payload: { text: `Downloading ${song.name} ${progress}...` }
    });

    // Decide which downloader to use based on the format
    if (song.format === 'mp3') {
      await downloadMp3(song);
    } else if (song.format === 'wav') {
      await downloadWav(song, tabId);
    }

    // Add a random delay between 2 and 5 seconds
    const delay = Math.random() * 3000 + 2000; // 2000ms to 5000ms
    console.log(`Waiting for ${Math.round(delay / 1000)} seconds...`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  console.log("background.js: Finished processing queue.");
  chrome.runtime.sendMessage({
    action: 'downloadComplete',
    payload: { text: `Finished ${total} downloads.` }
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'startDownload') {
    console.log("background.js: Received 'startDownload' message.", message.payload);
    const { songs, format, tabId } = message.payload;
    const queue = songs.map(song => ({ ...song, format }));
    processQueue(queue, tabId);
  }
});