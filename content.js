// content.js

const downloadIconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" class="-ml-1 h-4 w-4">
  <path d="M12 15.586l-4.293-4.293a1 1 0 0 0-1.414 1.414l5 5a1 1 0 0 0 1.414 0l5-5a1 1 0 0 0-1.414-1.414L12 15.586z"/>
  <path d="M12 4a1 1 0 0 0-1 1v9a1 1 0 1 0 2 0V5a1 1 0 0 0-1-1z"/>
  <path d="M5 19a1 1 0 0 0 1 1h12a1 1 0 1 0 0-2H6a1 1 0 0 0-1 1z"/>
</svg>`;

function injectDownloadButtons() {
    const songItems = document.querySelectorAll('div[class*="content-container"] a[href*="/song/"]');

    songItems.forEach(songLink => {
        const songContainer = songLink.closest('div[style*="grid-template-columns"]');
        if (!songContainer || songContainer.classList.contains('suno-dl-buttons-injected')) {
            return;
        }
        songContainer.classList.add('suno-dl-buttons-injected');

        // --- THIS IS THE LINE TO UPDATE ---
        // Replace 'div[class*="gap"]' with the new selector you copied.
        const actionsContainer = songContainer.querySelector('#main-container > div.css-tvd8or.e1ieu1no0 > div > div > div > div > div:nth-child(3) > div > div > div.css-vnzcnw.eycu6jm1 > div > div.clip-browser-list-scroller.css-11nl96j.e1qr1dqp2 > div.css-1ivfsy4.e1qr1dqp3 > div:nth-child(25) > div.css-u0rgu7.ej813yc0 > div > div > div:nth-child(1) > div.css-19e6g0z.eix3jn38 > div.css-7tgmjl.eix3jn315'); 
        // For example, if you copied '#... > div > div:nth-child(3)', the line would be:
        // const actionsContainer = songContainer.querySelector('#... > div > div:nth-child(3)');
        
        if (!actionsContainer) return;

        const href = songLink.href;
        const uuid = href.split('/song/')[1]?.split('/')[0];
        const title = songLink.textContent.trim().replace(/[\/\\:*?"<>|]/g, '-');
        if (!uuid || !title) return;

        const song = { id: uuid, name: title };

        const mp3Button = createDownloadButton('MP3', song, 'mp3');
        const wavButton = createDownloadButton('WAV', song, 'wav');

        actionsContainer.appendChild(mp3Button);
        actionsContainer.appendChild(wavButton);
    });
}

function createDownloadButton(format, song, formatKey) {
    const button = document.createElement('button');
    button.className = 'relative inline-block font-sans font-medium text-center before:absolute before:inset-0 before:pointer-events-none before:rounded-[inherit] before:border before:border-transparent before:bg-transparent after:absolute after:inset-0 after:pointer-events-none after:rounded-[inherit] after:bg-transparent after:opacity-0 enabled:hover:after:opacity-100 transition duration-75 before:transition before:duration-75 after:transition after:duration-75 select-none cursor-pointer px-4 py-2 rounded-full text-foreground-primary bg-background-tertiary enabled:hover:before:bg-overlay-on-primary disabled:after:bg-background-primary disabled:after:opacity-50 text-xs';
    button.style.marginLeft = '8px';

    button.innerHTML = `<span class="relative flex flex-row items-center justify-center gap-2">${downloadIconSvg} ${format}</span>`;

    button.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();

        button.innerHTML = `<span class="relative flex flex-row items-center justify-center gap-2">...</span>`;

        const defaultSettings = { createSubfolder: true, includeJpeg: true, includeUuid: true };
        const data = await chrome.storage.sync.get({ settings: defaultSettings });
        
        const workspaceNameEl = document.querySelector('div.css-9rwmp5.e1wyop193');
        const workspaceName = workspaceNameEl ? workspaceNameEl.textContent.trim().replace(/[\/\\:*?"<>|]/g, '-') : 'Suno Downloads';

        chrome.runtime.sendMessage({
            action: 'manualDownload',
            payload: {
                song: song,
                format: formatKey,
                settings: data.settings,
                workspaceName: workspaceName
            }
        });

        setTimeout(() => {
            button.innerHTML = `<span class="relative flex flex-row items-center justify-center gap-2">${downloadIconSvg} ${format}</span>`;
        }, 2000);
    };

    return button;
}

const observer = new MutationObserver((mutations) => {
    injectDownloadButtons();
});

const targetNode = document.body;
const config = { childList: true, subtree: true };
observer.observe(targetNode, config);

setTimeout(injectDownloadButtons, 1000);