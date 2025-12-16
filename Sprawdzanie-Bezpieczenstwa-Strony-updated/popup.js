function render(resultObj) {
  const siteEl = document.getElementById('site');
  const percentEl = document.getElementById('percent');
  const catsEl = document.getElementById('cats');
  if (!resultObj) {
    siteEl.innerText = 'Brak danych. Otwórz stronę i naciśnij Skanuj.';
    percentEl.innerText = '—';
    catsEl.innerHTML = '';
    return;
  }
  siteEl.innerText = 'Wynik analizy bezpieczeństwa';
  percentEl.innerText = resultObj.result.percent + '%';
  catsEl.innerHTML = '';
  const details = resultObj.result.details;
  const displayNames = resultObj.result.displayNames;
  for (const k of Object.keys(details)) {
    const div = document.createElement('div');
    div.className = 'cat';
    const name = document.createElement('div');
    name.innerText = displayNames[k];
    const val = document.createElement('div');
    val.innerText = details[k] ? '✅' : '❌';
    val.className = 'ok';
    div.appendChild(name);
    div.appendChild(val);
    catsEl.appendChild(div);
  }
}

document.getElementById('rescan').addEventListener('click', async ()=>{
  const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  if (tab) chrome.tabs.sendMessage(tab.id, {type:'TRIGGER_SCAN'});
  setTimeout(load,1200);
});

function load() {
  chrome.storage.local.get(['lastScan'], data => {
    if (!data.lastScan) {
      render(null);
    } else render(data.lastScan);
  });
}

load();