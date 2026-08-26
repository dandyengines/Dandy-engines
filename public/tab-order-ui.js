// ===== Reorder My Tabs — Settings screen =====
// Drag-to-reorder list of this person's own tabs. Saves immediately on
// drop, then rebuilds the sidebar/bottom-bar right away so the change is
// visible without needing to log out and back in. Pure display order —
// never changes what tabs someone can actually access.

async function renderTabOrderTab() {
  const content = document.getElementById('content');
  content.innerHTML = `<div class="stub-card">Loading…</div>`;
  let data;
  try {
    data = await api('/.netlify/functions/tab-order');
  } catch (e) {
    content.innerHTML = `<div class="stub-card">Couldn't load: ${escapeHtml(e.message)}</div>`;
    return;
  }
  paintTabOrder(data.order);
}

function paintTabOrder(order) {
  const content = document.getElementById('content');
  content.innerHTML = `
    <p class="muted-sm">Drag to reorder. This is just how your tabs are laid out — it doesn't change what you can see or edit. Your first three tabs also become your phone's quick-access bottom bar.</p>
    <div id="tab-order-list" class="job-list" style="margin-top:12px;">
      ${order.map((tabId) => `
        <div class="job-card tab-order-row" data-tab-id="${tabId}">
          <div class="job-card-row" style="cursor:default;">
            <span class="drag-handle">⠿</span>
            <div class="job-card-main"><div class="job-card-title">${labelForTab(tabId)}</div></div>
          </div>
        </div>
      `).join('')}
    </div>
    <p id="tab-order-save-msg" class="muted-sm" style="margin-top:10px;"></p>
  `;
  enableTabOrderDrag();
}

function enableTabOrderDrag() {
  const list = document.getElementById('tab-order-list');
  if (!list) return;
  let dragEl = null;

  list.querySelectorAll('.drag-handle').forEach((handle) => {
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dragEl = handle.closest('.tab-order-row');
      dragEl.setPointerCapture(e.pointerId);
      dragEl.classList.add('dragging');
      document.body.classList.add('is-dragging');

      const onMove = (ev) => {
        ev.preventDefault();
        const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.tab-order-row');
        if (target && target !== dragEl && target.parentElement === list) {
          const rect = target.getBoundingClientRect();
          list.insertBefore(dragEl, (ev.clientY - rect.top) < rect.height / 2 ? target : target.nextSibling);
        }
      };
      const onUp = async () => {
        dragEl.classList.remove('dragging');
        document.body.classList.remove('is-dragging');
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        const newOrder = Array.from(list.querySelectorAll('.tab-order-row')).map((r) => r.dataset.tabId);
        await saveTabOrder(newOrder);
        dragEl = null;
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
  });
}

async function saveTabOrder(newOrder) {
  const msg = document.getElementById('tab-order-save-msg');
  if (msg) msg.textContent = 'Saving…';
  try {
    const { order } = await api('/.netlify/functions/tab-order', {
      method: 'POST', body: JSON.stringify({ action: 'set', order: newOrder }),
    });
    session.tabs = order;
    localStorage.setItem('de_session', JSON.stringify(session));
    buildNav();
    if (msg) msg.textContent = 'Saved.';
  } catch (e) {
    if (msg) msg.textContent = "Couldn't save: " + e.message;
  }
}
