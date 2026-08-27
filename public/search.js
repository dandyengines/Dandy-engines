// ===== Master search — header search icon opens a popup bubble that =====
// ===== searches everything the logged-in user can access ===============

let searchDebounceTimer = null;
let searchRequestSeq = 0;

function openSearchBubble() {
  const overlay = document.getElementById('search-overlay');
  const input = document.getElementById('search-bubble-input');
  overlay.hidden = false;
  input.value = '';
  document.getElementById('search-bubble-results').innerHTML = '';
  input.focus();
}

function closeSearchBubble() {
  document.getElementById('search-overlay').hidden = true;
}

function wireSearchBubble() {
  document.getElementById('search-btn').addEventListener('click', openSearchBubble);
  document.getElementById('search-bubble-close').addEventListener('click', closeSearchBubble);
  document.getElementById('search-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'search-overlay') closeSearchBubble();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('search-overlay').hidden) closeSearchBubble();
  });

  const input = document.getElementById('search-bubble-input');
  input.addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    const q = input.value.trim();
    const resultsEl = document.getElementById('search-bubble-results');
    if (q.length < 2) { resultsEl.innerHTML = ''; return; }
    resultsEl.innerHTML = '<p class="muted-sm">Searching…</p>';
    searchDebounceTimer = setTimeout(async () => {
      const mySeq = ++searchRequestSeq;
      try {
        const { results } = await api(`/.netlify/functions/search?q=${encodeURIComponent(q)}`);
        if (mySeq !== searchRequestSeq) return; // a newer search superseded this one — ignore
        resultsEl.innerHTML = results.length
          ? results.map((r) => `<button class="search-result-row" data-tab="${r.tabId}">${escapeHtml(r.label)}</button>`).join('')
          : '<p class="muted-sm">No matches.</p>';
        resultsEl.querySelectorAll('.search-result-row').forEach((btn) => {
          btn.addEventListener('click', () => {
            closeSearchBubble();
            setActiveTab(btn.dataset.tab);
          });
        });
      } catch (e) {
        if (mySeq !== searchRequestSeq) return;
        resultsEl.innerHTML = `<p class="muted-sm">Couldn't search: ${escapeHtml(e.message)}</p>`;
      }
    }, 250);
  });
}
