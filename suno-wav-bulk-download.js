// ============================================================
// SUNO WAV BULK DOWNLOADER v2 - Console Script
// ============================================================
//
// USAGE:
//   1. Go to https://suno.com/me (your Library)
//   2. Open browser DevTools (F12 or Cmd+Shift+I)
//   3. Paste this entire script into the Console tab
//   4. Press Enter — it will enumerate all your songs, then
//      trigger WAV conversion and download each one.
//
// RESUME: If the script stops (crash, tab close, rate limit),
//   just paste and run it again. It will skip already-downloaded
//   songs automatically using localStorage to track progress.
//
// RESET: To start fresh, run in console:
//   localStorage.removeItem('suno_dl_progress')
//
// CONFIGURATION (edit these before running):
const CONFIG = {
  // Delay between songs (ms) — ~10s mimics human download pace
  CONVERSION_DELAY: 8000,
  // Delay between page fetches when enumerating library (ms)
  PAGE_FETCH_DELAY: 3000,
  // Delay before first WAV download attempt after conversion (ms)
  WAV_READY_DELAY: 6000,
  // Max retries for WAV download (conversion can take time)
  WAV_MAX_RETRIES: 8,
  // Delay between WAV download retries (ms)
  WAV_RETRY_DELAY: 6000,
  // Set to true to do a dry run (list songs without downloading)
  DRY_RUN: false,
  // Max songs to download (set to Infinity for all)
  MAX_SONGS: Infinity,
  // Skip songs with these statuses
  SKIP_STATUSES: ['trashed', 'error', 'failed'],
  // Refresh auth token every N songs (Clerk tokens can expire)
  TOKEN_REFRESH_INTERVAL: 25,
};

// ============================================================
// HELPERS
// ============================================================

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sanitizeFilename(name) {
  return name.replace(/[\/\\:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
}

function formatBytes(bytes) {
  if (!bytes) return 'unknown size';
  const mb = (bytes / (1024 * 1024)).toFixed(1);
  return `${mb} MB`;
}

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

function log(msg, type = 'info') {
  const ts = new Date().toLocaleTimeString();
  const prefix = {
    info: '🎵', success: '✅', warn: '⚠️', error: '❌', progress: '⏳',
  }[type] || 'ℹ️';
  console.log(`${prefix} [${ts}] ${msg}`);
}

// ============================================================
// PROGRESS TRACKER (survives page reload via localStorage)
// ============================================================

const Progress = {
  _key: 'suno_dl_progress',

  load() {
    try {
      return JSON.parse(localStorage.getItem(this._key)) || { downloaded: [], failed: [] };
    } catch { return { downloaded: [], failed: [] }; }
  },

  save(data) {
    localStorage.setItem(this._key, JSON.stringify(data));
  },

  markDownloaded(id) {
    const data = this.load();
    if (!data.downloaded.includes(id)) data.downloaded.push(id);
    this.save(data);
  },

  markFailed(id) {
    const data = this.load();
    if (!data.failed.includes(id)) data.failed.push(id);
    this.save(data);
  },

  isDownloaded(id) {
    return this.load().downloaded.includes(id);
  },

  stats() {
    const data = this.load();
    return { downloaded: data.downloaded.length, failed: data.failed.length };
  },

  reset() {
    localStorage.removeItem(this._key);
  }
};

// ============================================================
// AUTH (with refresh support)
// ============================================================

let _currentToken = null;
let _tokenFetchedAt = 0;

async function getAuthToken(forceRefresh = false) {
  // Reuse token if fresh (< 5 min old) and not forced
  if (!forceRefresh && _currentToken && (Date.now() - _tokenFetchedAt < 5 * 60 * 1000)) {
    return _currentToken;
  }

  try {
    if (window.Clerk?.session) {
      const token = await window.Clerk.session.getToken();
      if (token) {
        _currentToken = token;
        _tokenFetchedAt = Date.now();
        return token;
      }
    }
  } catch (e) {
    log('Clerk token failed, trying cookie fallback...', 'warn');
  }
  const cookie = document.cookie
    .split('; ')
    .find((c) => c.startsWith('__session='));
  if (cookie) {
    _currentToken = cookie.split('=')[1];
    _tokenFetchedAt = Date.now();
    return _currentToken;
  }
  throw new Error('Could not get auth token. Are you logged in to Suno?');
}

// ============================================================
// API: LIST ALL SONGS
// ============================================================

async function fetchAllSongs(token) {
  const songs = [];
  let cursor = null;
  let hasMore = true;
  let page = 0;

  log('Fetching your song library...', 'progress');

  while (hasMore) {
    const body = cursor ? { page: 1, cursor } : { page: 1 };

    let resp;
    try {
      resp = await fetch('https://studio-api.prod.suno.com/api/feed/v3', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      log(`Network error fetching page ${page + 1}, retrying in 10s...`, 'warn');
      await sleep(10000);
      continue;
    }

    if (resp.status === 429) {
      log('Rate limited — waiting 15s before retrying...', 'warn');
      await sleep(15000);
      continue;
    }

    if (!resp.ok) {
      log(`Feed API error: ${resp.status} — retrying in 10s...`, 'warn');
      await sleep(10000);
      continue;
    }

    const data = await resp.json();
    const clips = data.clips || [];

    for (const clip of clips) {
      if (CONFIG.SKIP_STATUSES.includes(clip.status)) continue;
      songs.push({
        id: clip.id,
        title: clip.title || 'Untitled',
        status: clip.status,
        created_at: clip.created_at,
        audio_url: clip.audio_url,
      });
    }

    hasMore = data.has_more;
    cursor = data.next_cursor;
    page++;
    log(`  Page ${page}: ${clips.length} clips (${songs.length} total)`, 'info');

    if (hasMore) await sleep(CONFIG.PAGE_FETCH_DELAY);
  }

  log(`Found ${songs.length} songs in your library.`, 'success');
  return songs;
}

// ============================================================
// API: TRIGGER WAV CONVERSION
// ============================================================

async function triggerWavConversion(token, songId) {
  let resp;
  try {
    resp = await fetch(
      `https://studio-api.prod.suno.com/api/gen/${songId}/convert_wav/`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (e) {
    log(`  Network error triggering conversion, retrying in 10s...`, 'warn');
    await sleep(10000);
    return triggerWavConversion(token, songId);
  }

  if (resp.status === 204 || resp.status === 200) return true;
  if (resp.status === 429) {
    log('  Rate limited on conversion — waiting 20s...', 'warn');
    await sleep(20000);
    return triggerWavConversion(token, songId);
  }
  log(`  Conversion trigger failed for ${songId}: ${resp.status}`, 'error');
  return false;
}

// ============================================================
// DOWNLOAD: WAV FILE (blob-based with explicit memory cleanup)
// ============================================================

async function downloadWav(songId, title, index, total) {
  const wavUrl = `https://cdn1.suno.ai/${songId}.wav`;
  const filename = `${sanitizeFilename(title)} [${songId.slice(0, 8)}].wav`;

  for (let attempt = 1; attempt <= CONFIG.WAV_MAX_RETRIES; attempt++) {
    try {
      // HEAD check to see if file is ready (no memory cost)
      const headResp = await fetch(wavUrl, { method: 'HEAD' });

      if (headResp.status === 200) {
        const size = headResp.headers.get('content-length');
        log(`  Downloading: ${filename} (${formatBytes(size)})`, 'progress');

        // Fetch as blob — required for cross-origin download
        const resp = await fetch(wavUrl);
        let blob = await resp.blob();

        // Create object URL, trigger download, then clean up immediately
        let blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Immediate cleanup — revoke URL and null refs to release memory
        URL.revokeObjectURL(blobUrl);
        blobUrl = null;
        blob = null;

        // Give browser time to flush the download to disk and GC to reclaim
        await sleep(2000);

        log(`  [${index + 1}/${total}] ✓ ${filename}`, 'success');
        return true;
      }

      if (headResp.status === 404 && attempt < CONFIG.WAV_MAX_RETRIES) {
        log(`  WAV not ready (attempt ${attempt}/${CONFIG.WAV_MAX_RETRIES}), waiting...`, 'progress');
        await sleep(CONFIG.WAV_RETRY_DELAY);
        continue;
      }
    } catch (e) {
      if (attempt < CONFIG.WAV_MAX_RETRIES) {
        log(`  Download error (attempt ${attempt}), retrying...`, 'warn');
        await sleep(CONFIG.WAV_RETRY_DELAY);
        continue;
      }
    }
  }

  log(`  FAILED: ${title} (${songId})`, 'error');
  return false;
}

// ============================================================
// MAIN
// ============================================================

(async () => {
  try {
    console.clear();
    log('=== SUNO WAV BULK DOWNLOADER v2 ===', 'info');
    log('Features: resume support, memory-safe downloads, token refresh', 'info');

    const prevStats = Progress.stats();
    if (prevStats.downloaded > 0) {
      log(`Resuming — ${prevStats.downloaded} songs already downloaded, ${prevStats.failed} failed.`, 'success');
    }

    // Step 1: Auth
    const token = await getAuthToken();
    log('Authenticated.', 'success');

    // Step 2: Fetch all songs
    const allSongs = await fetchAllSongs(token);

    if (allSongs.length === 0) {
      log('No songs found in your library!', 'warn');
      return;
    }

    // Filter out already-downloaded songs
    const pendingSongs = allSongs.filter(s => !Progress.isDownloaded(s.id));
    const songs = pendingSongs.slice(0, CONFIG.MAX_SONGS);

    log(`Library: ${allSongs.length} total, ${allSongs.length - pendingSongs.length} already done, ${songs.length} to download.`, 'info');

    // Dry run — just list
    if (CONFIG.DRY_RUN) {
      log('--- DRY RUN: Song List ---', 'info');
      songs.forEach((s, i) => {
        console.log(`  ${i + 1}. ${s.title} [${s.id}] (${s.status})`);
      });
      log(`Total: ${songs.length} pending songs. Set DRY_RUN to false to download.`, 'info');
      return;
    }

    if (songs.length === 0) {
      log('All songs already downloaded! Run localStorage.removeItem("suno_dl_progress") to reset.', 'success');
      return;
    }

    // Step 3: Process each song
    const results = { success: 0, failed: 0, skipped: 0 };
    const startTime = Date.now();

    for (let i = 0; i < songs.length; i++) {
      const song = songs[i];

      // Refresh token periodically
      if (i > 0 && i % CONFIG.TOKEN_REFRESH_INTERVAL === 0) {
        log('Refreshing auth token...', 'info');
        await getAuthToken(true);
      }

      // Progress estimate
      if (i > 0 && i % 10 === 0) {
        const elapsed = Date.now() - startTime;
        const perSong = elapsed / i;
        const remaining = perSong * (songs.length - i);
        const totalDone = Progress.stats().downloaded;
        log(`--- Progress: ${totalDone}/${allSongs.length} total | ETA: ${formatTime(remaining)} remaining ---`, 'info');
      }

      log(`[${i + 1}/${songs.length}] ${song.title}`, 'progress');

      // Trigger WAV conversion
      const currentToken = await getAuthToken();
      const converted = await triggerWavConversion(currentToken, song.id);
      if (!converted) {
        Progress.markFailed(song.id);
        results.failed++;
        continue;
      }

      // Wait for conversion
      await sleep(CONFIG.WAV_READY_DELAY);

      // Download (memory-safe)
      const downloaded = await downloadWav(song.id, song.title, i, songs.length);
      if (downloaded) {
        Progress.markDownloaded(song.id);
        results.success++;
      } else {
        Progress.markFailed(song.id);
        results.failed++;
      }

      // Delay before next song
      if (i < songs.length - 1) {
        await sleep(CONFIG.CONVERSION_DELAY);
      }
    }

    // Summary
    const totalStats = Progress.stats();
    const elapsed = formatTime(Date.now() - startTime);
    log('=== DOWNLOAD COMPLETE ===', 'success');
    log(`  This session: ${results.success} downloaded, ${results.failed} failed (${elapsed})`, 'info');
    log(`  Overall: ${totalStats.downloaded}/${allSongs.length} songs downloaded`, 'info');
    if (totalStats.failed > 0) {
      log(`  ${totalStats.failed} songs failed — re-run the script to retry them.`, 'warn');
    }

  } catch (e) {
    log(`Fatal error: ${e.message}`, 'error');
    log('Your progress is saved. Just re-run the script to resume.', 'info');
    console.error(e);
  }
})();
