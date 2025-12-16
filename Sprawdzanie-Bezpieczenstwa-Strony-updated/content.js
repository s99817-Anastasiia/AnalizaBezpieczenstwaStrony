// content.js - zbiera tekst, linki i PDFy i wysyła do background
(function(){
  function collectText() {
    const bodyText = document.body ? document.body.innerText : '';
    let meta = '';
    const md = document.querySelector('meta[name="description"]');
    if (md) meta = md.content || '';
    return (meta + '\n' + bodyText).slice(0, 200000);
  }
  function collectLinks() {
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    const links = anchors.map(a => ({href: a.href, text: (a.innerText || a.getAttribute('aria-label') || '').trim()}));
    const pdfLinks = links.filter(l => l.href.toLowerCase().endsWith('.pdf')).map(l => l.href);
    return {links: links.slice(0,500), pdfLinks};
  }

  async function sendScan() {
    const text = collectText();
    const {links, pdfLinks} = collectLinks();
    const payload = {url: location.href, text, links, pdfLinks};
    chrome.runtime.sendMessage({type:'PAGE_SCAN', payload}, (response)=>{
      if (response && response.result) {
        // store for popup
        chrome.runtime.sendMessage({type:'STORE_RESULT', result: {url: location.href, result: response.result}});
      }
    });
  }

  chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
    if (msg.type==='TRIGGER_SCAN') {
      sendScan();
      sendResponse({ok:true});
    }
  });

  window.addEventListener('load', ()=>{
    setTimeout(sendScan, 800);
  });
})();