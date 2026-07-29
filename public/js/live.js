(function () {
  const board = document.querySelector('.live-board');
  if (!board) return;

  const eventId = board.dataset.eventId;
  const socket = window.io();
  socket.emit('event:join', eventId);

  function isCurrentEvent(payload) {
    if (!payload?.event_id) return true;
    return String(payload.event_id) === String(eventId);
  }

  socket.on('match:created', (payload) => {
    if (isCurrentEvent(payload)) loadMatches();
  });
  socket.on('match:deleted', (payload) => {
    if (isCurrentEvent(payload)) loadMatches();
  });
  socket.on('fights:updated', (payload) => {
    if (isCurrentEvent(payload)) loadMatches();
  });
  socket.on('matches:updated', (payload) => {
    if (isCurrentEvent(payload)) loadMatches();
  });
  socket.on('pool:updated', (payload) => {
    if (isCurrentEvent(payload)) loadMatches();
  });

  async function loadMatches() {
    const response = await fetch(`/matching/api/matches?event_id=${encodeURIComponent(eventId)}`);
    const payload = await response.json();
    document.getElementById('liveMatches').innerHTML = payload.matches.length
      ? payload.matches.map(renderMatch).join('')
      : '<div class="text-white-50">No fights matched yet.</div>';
  }

  function renderMatch(match) {
    const resultLabel = match.result && match.result !== 'pending' ? ` / ${match.result}` : '';
    const markerSuffix = match.marker_suffix || '';
    const markerHtml = markerSuffix ? `<span class="match-marker">${escapeHtml(markerSuffix)}</span>` : '';
    const meronType = match.is_mixed_type ? ` (${escapeHtml(match.meron_type)})` : '';
    const walaType = match.is_mixed_type ? ` (${escapeHtml(match.wala_type)})` : '';
    return `
      <article class="live-card">
        <div class="live-fight">Fight #${match.fight_no}${markerHtml}</div>
        <div class="live-sides">
          <div><span>MERON</span><strong>${escapeHtml(match.meron_owner)}</strong><em>${match.meron_weight}g${meronType}</em></div>
          <div><span>WALA</span><strong>${escapeHtml(match.wala_owner)}</strong><em>${match.wala_weight}g${walaType}</em></div>
        </div>
        <div class="live-meta">Difference ${match.weight_difference}g / ${match.status}${resultLabel}</div>
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
