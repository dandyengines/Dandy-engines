// ===== Generic modal popup ===== used for "New Job" forms so they open as
// a real popup instead of requiring a scroll to the bottom of the page.

function openModal(html) {
  const overlay = document.getElementById('modal-overlay');
  const card = document.getElementById('modal-card');
  card.innerHTML = html;
  overlay.hidden = false;
  return card;
}

function closeModal() {
  document.getElementById('modal-overlay').hidden = true;
  document.getElementById('modal-card').innerHTML = '';
}

// Wire immediately — by the time this script tag executes (placed at the
// end of body), the modal-overlay element above it is already parsed.
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'modal-overlay') closeModal();
});
document.addEventListener('keydown', (e) => {
  const overlay = document.getElementById('modal-overlay');
  if (e.key === 'Escape' && !overlay.hidden) closeModal();
});
