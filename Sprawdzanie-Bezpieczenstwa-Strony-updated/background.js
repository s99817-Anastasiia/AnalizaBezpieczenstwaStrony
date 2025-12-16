// background.js - service worker (PL) 
// Próbuje załadować pdfjs: najpierw z vendor/pdfjs-dist/build/pdf.js, jeśli nie ma - próbuje CDN (wymaga internetu).
try {
  importScripts('vendor/pdfjs-dist/build/pdf.js');
  console.log('Ładowanie pdfjs z vendor (jeśli dostępne).');
} catch(e) {
  try {
    // CDN fallback - importScripts działa w service workerze
    importScripts('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js');
    console.log('Ładowanie pdfjs z CDN.');
  } catch(err) {
    console.warn('Brak pdfjs (vendor i CDN nie dostępne). Parsowanie PDF będzie ograniczone.');
  }
}

// Słowa kluczowe (PL + EN)
const KEYWORDS = {
  privacy: ['rodo','ochrona danych','ochrona prywatno','polityka prywatno','privacy','gdpr','privacy policy','dane osobowe','przetwarzanie danych'],
  cookies: ['cookie','cookies','ciasteczka','polityka cookies','polityka cookie','ciasteczka'],
  payments: ['płatno','platnosc','płatność','płatności','payment','secure payment','pci','bramka płatności','payment gateway','karta płatnicza'],
  security: ['bezpieczen','security','szyfr','szyfrow','ssl','tls','https','certyfikat','bezpieczeństwo danych','ochrona techniczna'],
  breach: ['naruszen','naruszenie','wyciek','incydent','data breach','zgłasz','zgłoszen','powiadom','naruszenia']
};

const DISPLAY_NAMES = {
  privacy: 'RODO / ochrona danych',
  cookies: 'Ciasteczka (cookies)',
  payments: 'Płatności',
  security: 'Bezpieczeństwo techniczne',
  breach: 'Przetwarzanie danych'
};

function detectKeywordsInText(text) {
  const low = (text||'').toLowerCase();
  const found = {};
  for (const cat of Object.keys(KEYWORDS)) {
    found[cat] = false;
    for (const kw of KEYWORDS[cat]) {
      if (low.includes(kw)) { found[cat] = true; break; }
    }
  }
  return found;
}

async function fetchPdfText(url) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('fetch failed');
    const ab = await resp.arrayBuffer();
    if (typeof pdfjsLib !== 'undefined' && pdfjsLib.getDocument) {
      const loadingTask = pdfjsLib.getDocument({data: ab});
      const pdf = await loadingTask.promise;
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map(it => it.str);
        fullText += strings.join(' ') + '\\n';
      }
      return fullText;
    } else {
      // Fallback: prosty ASCII scan
      const bytes = new Uint8Array(ab);
      let ascii = '';
      for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        if (b >= 32 && b <= 126) ascii += String.fromCharCode(b);
        else ascii += ' ';
      }
      ascii = ascii.replace(/\\s{2,}/g, ' ');
      return ascii;
    }
  } catch (e) {
    console.warn('fetchPdfText error', e);
    return null;
  }
}

async function scorePayload(payload) {
  // payload: {url, text, links, pdfLinks}
  const text = payload.text || '';
  let found = detectKeywordsInText(text);

  // also check link texts and hrefs
  if (payload.links) {
    for (const l of payload.links) {
      const lt = (l.text||'') + ' ' + (l.href||'');
      const fk = detectKeywordsInText(lt);
      for (const k of Object.keys(fk)) if (fk[k]) found[k]=true;
    }
  }

  // check PDFs
  if (payload.pdfLinks && payload.pdfLinks.length) {
    for (const p of payload.pdfLinks) {
      const pdfText = await fetchPdfText(p);
      if (pdfText) {
        const fk = detectKeywordsInText(pdfText);
        for (const k of Object.keys(fk)) if (fk[k]) found[k]=true;
      }
    }
  }

  // prepare result: for each category show boolean (true->check) and compute average percent = (sum true / count)*100
  const cats = Object.keys(DISPLAY_NAMES);
  let sum = 0;
  const details = {};
  for (const c of cats) {
    details[c] = !!found[c];
    if (details[c]) sum += 1;
  }
  const percent = Math.round((sum / cats.length) * 100);
  return {percent, details, displayNames: DISPLAY_NAMES};
}

// Messages from content script or popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'PAGE_SCAN') {
    scorePayload(msg.payload).then(result => sendResponse({ok:true,result})).catch(err=>sendResponse({ok:false,error:err.toString()}));
    return true;
  } else if (msg.type === 'TRIGGER_SCAN') {
    // forward to content script in tab
    if (sender.tab && sender.tab.id) {
      chrome.tabs.sendMessage(sender.tab.id, {type:'TRIGGER_SCAN'});
    } else {
      // try to find active tab
      chrome.tabs.query({active:true,currentWindow:true}).then(tabs=>{
        if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id,{type:'TRIGGER_SCAN'});
      });
    }
  } else if (msg.type === 'STORE_RESULT') {
    // store last result for popup
    chrome.storage.local.set({lastScan: msg.result});
    sendResponse({ok:true});
  }
});

// Action button triggers content script scan
chrome.action.onClicked.addListener(async (tab) => {
  if (tab && tab.id) {
    chrome.tabs.sendMessage(tab.id, {type:'TRIGGER_SCAN'});
  }
});
