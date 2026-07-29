(function () {
  const board = document.querySelector('.live-board');
  if (!board) return;

  const eventId = board.dataset.eventId;
  const socket = window.io();
  socket.emit('event:join', eventId);
  socket.on('match:created', loadMatches);
  socket.on('matches:updated', loadMatches);

  async function loadMatches() {
    const response = await fetch(`/matching/api/matches?event_id=${encodeURIComponent(eventId)}`);
    const payload = await response.json();
    document.getElementById('liveMatches').innerHTML = payload.matches.map(renderMatch).join('');
  }

  function renderMatch(match) {
    return `
      <article class="live-card">
        <div class="live-fight">Fight #${match.fight_no}</div>
        <div class="live-sides">
          <div><span>MERON</span><strong>${escapeHtml(match.meron_owner)}</strong><em>${match.meron_weight}g</em></div>
          <div><span>WALA</span><strong>${escapeHtml(match.wala_owner)}</strong><em>${match.wala_weight}g</em></div>
        </div>
        <div class="live-meta">Difference ${match.weight_difference}g / ${match.status}</div>
      </article>
    `;
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[character]));
  }
})();
