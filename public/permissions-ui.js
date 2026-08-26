// ===== Manage Team Permissions — admin-only, reached from Settings =====
// Deliberately plain/functional per request ("doesn't have to be pretty,
// just back-end stuff"). One big table: rows = tabs, columns = users, each
// cell a select (View/Edit/Unseen) that saves immediately on change.

let permissionsState = { matrix: {}, users: [], tabDefs: [] };

async function renderPermissionsTab() {
  const content = document.getElementById('content');
  content.innerHTML = `<div class="stub-card">Loading…</div>`;
  let data;
  try {
    data = await api('/.netlify/functions/permissions');
  } catch (e) {
    content.innerHTML = `<div class="stub-card">Couldn't load: ${escapeHtml(e.message)}</div>`;
    return;
  }
  permissionsState = data;
  paintPermissions();
}

function paintPermissions() {
  const content = document.getElementById('content');
  const { matrix, users, tabDefs } = permissionsState;

  content.innerHTML = `
    <p class="muted-sm">Jake's own account always has full access everywhere, regardless of what's set here — this can't lock him out. Every other row governs what that person can see or do on that tab.</p>
    <button id="perm-reset-btn" style="margin:10px 0;padding:8px 14px;border-radius:8px;border:1px solid var(--de-red);background:var(--panel-raised);color:var(--de-red);">Reset All To Defaults</button>
    <div style="overflow-x:auto;">
      <table class="perm-table">
        <thead>
          <tr>
            <th>Tab</th>
            ${users.map((u) => `<th>${escapeHtml(u.name)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${tabDefs.map((tab) => `
            <tr>
              <td>${escapeHtml(tab.label)}</td>
              ${users.map((u) => `
                <td>
                  <select class="perm-cell" data-user="${u.id}" data-tab="${tab.id}">
                    <option value="view" ${matrix[u.id]?.[tab.id] === 'view' ? 'selected' : ''}>View</option>
                    <option value="edit" ${matrix[u.id]?.[tab.id] === 'edit' ? 'selected' : ''}>Edit</option>
                    <option value="unseen" ${matrix[u.id]?.[tab.id] === 'unseen' ? 'selected' : ''}>Unseen</option>
                  </select>
                </td>
              `).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <p id="perm-save-msg" class="muted-sm" style="margin-top:10px;"></p>
  `;

  document.querySelectorAll('.perm-cell').forEach((sel) => {
    sel.addEventListener('change', async () => {
      const userId = sel.dataset.user, tabId = sel.dataset.tab, level = sel.value;
      const msg = document.getElementById('perm-save-msg');
      msg.textContent = 'Saving…';
      try {
        const { matrix } = await api('/.netlify/functions/permissions', {
          method: 'POST', body: JSON.stringify({ action: 'set', userId, tabId, level }),
        });
        permissionsState.matrix = matrix;
        msg.textContent = `Saved — ${users.find((u) => u.id === userId)?.name}'s "${tabDefs.find((t) => t.id === tabId)?.label}" access is now ${level}.`;
      } catch (e) {
        msg.textContent = "Couldn't save: " + e.message;
      }
    });
  });

  document.getElementById('perm-reset-btn').addEventListener('click', async () => {
    if (!confirm('Reset every permission back to the original defaults? This discards all custom changes.')) return;
    try {
      const { matrix } = await api('/.netlify/functions/permissions', { method: 'POST', body: JSON.stringify({ action: 'reset' }) });
      permissionsState.matrix = matrix;
      paintPermissions();
    } catch (e) { alert("Couldn't reset: " + e.message); }
  });
}
