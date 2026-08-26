// ===== App-wide Undo toast =====
// Shown after actions like Delete; duration configurable in Settings
// (3/5/10 seconds, default 5s), stored in localStorage.

let undoTimer = null;

function getUndoDurationMs() {
  const stored = parseInt(localStorage.getItem('de_undo_duration') || '5', 10);
  return (isNaN(stored) ? 5 : stored) * 1000;
}

function showUndoToast(message, undoFn) {
  const toast = document.getElementById('undo-toast');
  const msgEl = document.getElementById('undo-toast-msg');
  const btn = document.getElementById('undo-toast-btn');

  clearTimeout(undoTimer);
  msgEl.textContent = message;
  toast.hidden = false;

  const onClick = async () => {
    toast.hidden = true;
    btn.removeEventListener('click', onClick);
    try {
      await undoFn();
    } catch (e) {
      alert("Couldn't undo: " + e.message);
    }
  };
  btn.replaceWith(btn.cloneNode(true)); // clear any previous listener
  document.getElementById('undo-toast-btn').addEventListener('click', onClick);

  undoTimer = setTimeout(() => { toast.hidden = true; }, getUndoDurationMs());
}
