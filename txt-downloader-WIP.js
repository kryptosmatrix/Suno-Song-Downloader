// txt-downloader.js

// This function will be injected into the page to scrape the style and lyrics.
// It uses XPath, which is better for finding text nodes.
function scrapeTextData() {
  const data = {
    style: null,
    lyrics: null,
  };

  try {
    // XPath for the style/genre
    const styleXpath = '//*[@id="main-container"]/div[1]/div/div/div/div/div[4]/div/div/div[1]/div[2]/div[4]/div/text()';
    const styleResult = document.evaluate(styleXpath, document, null, XPathResult.STRING_TYPE, null);
    if (styleResult.stringValue) {
      data.style = styleResult.stringValue.trim();
    }

    // XPath for the lyrics
    const lyricsXpath = '//*[@id="main-container"]/div[1]/div/div/div/div/div[4]/div/div/div[1]/div[2]/div[6]/text()';
    const lyricsResult = document.evaluate(lyricsXpath, document, null, XPathResult.STRING_TYPE, null);
    if (lyricsResult.stringValue) {
      data.lyrics = lyricsResult.stringValue.trim();
    }
  } catch (e) {
    console.error("Error during XPath scraping:", e);
  }

  return data;
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// This is the main exported function.
export async function downloadTxt(song, tabId, settings, workspaceName) {
  // Only proceed if at least one of the text options is enabled.
  if (!settings.includeLyrics && !settings.includeStyle) {
    return;
  }

  const { id: uuid, name: title } = song;

  try {
    // To get the style/lyrics, we must first navigate to the song's page.
    const songPageUrl = `https://suno.com/song/${uuid}`;
    await chrome.tabs.update(tabId, { url: songPageUrl });

    // Wait for the page to load. A simple delay is often sufficient.
    // A more robust solution would use listeners, but this is simpler.
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Now that we're on the song page, execute the scraping script.
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: scrapeTextData,
    });

    const textData = results[0].result;
    if (!textData) {
        console.warn(`Could not scrape text data for ${title}`);
        return;
    }

    // Prepare the content for the .txt file.
    let fileContent = '';
    if (settings.includeStyle && textData.style) {
      fileContent += `Style:\n${textData.style}\n\n`;
    }
    if (settings.includeLyrics && textData.lyrics) {
      fileContent += `Lyrics:\n${textData.lyrics}\n`;
    }

    // If we have content, create and download the file.
    if (fileContent) {
      const baseFilename = settings.includeUuid ? `${title} - ${uuid}.txt` : `${title}.txt`;
      let finalFilename = baseFilename;
      if (settings.createSubfolder && workspaceName) {
        finalFilename = `SUNO_${workspaceName}/${baseFilename}`;
      }

      const blob = new Blob([fileContent], { type: 'text/plain' });
      const dataUrl = await blobToDataURL(blob);
      
      chrome.downloads.download({
        url: dataUrl,
        filename: finalFilename,
        conflictAction: 'uniquify'
      });
    }

  } catch (error) {
    console.error(`Failed to create text file for "${title}":`, error);
  }
}
