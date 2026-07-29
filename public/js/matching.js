(function () {
  const grid = document.querySelector('.matching-grid');
  if (!grid) return;

  const meta = JSON.parse(document.getElementById('matchingBoardMeta')?.textContent || '{"noFightKeys":[]}');
  const eventId = grid.dataset.eventId;
  const giveTake = Number(grid.dataset.giveTake || 0);
  const availableList = document.getElementById('availableList');
  const meronZone = document.getElementById('meronZone');
  const walaZone = document.getElementById('walaZone');
  const weightDiff = document.getElementById('weightDiff');
  const alertBox = document.getElementById('matchAlert');
  const confirmButton = document.getElementById('confirmMatch');
  const autoMatchButton = document.getElementById('autoMatch');
  const removeUnfoughtButton = document.getElementById('removeUnfought');
  const resetButton = document.getElementById('resetBoard');
  const recommendationBar = document.getElementById('recommendationBar');
  const recommendationText = document.getElementById('recommendationText');
  const showAllButton = document.getElementById('showAllChickens');
  const matchesList = document.getElementById('matchesList');
  const overridePasscodeModal = new bootstrap.Modal(document.getElementById('overridePasscodeModal'));
  const autoMatchPreviewModal = new bootstrap.Modal(document.getElementById('autoMatchPreviewModal'));
  const autoMatchResultModal = new bootstrap.Modal(document.getElementById('autoMatchResultModal'));
  const socket = window.io();
  let recommendationFor = '';
  let noFightKeys = new Set(meta.noFightKeys || []);
  let pendingAutoMatchPreview = null;
  let pendingConfirm = null;

  socket.emit('event:join', eventId);
  socket.on('pool:updated', (payload) => {
    if (payload?.event_id && String(payload.event_id) !== String(eventId)) return;
    refreshBoard();
  });
  socket.on('match:created', (payload) => {
    if (payload?.event_id && String(payload.event_id) !== String(eventId)) return;
    refreshBoard();
  });
  socket.on('match:deleted', (payload) => {
    if (payload?.event_id && String(payload.event_id) !== String(eventId)) return;
    refreshBoard();
  });
  socket.on('fights:updated', (payload) => {
    if (payload?.event_id && String(payload.event_id) !== String(eventId)) return;
    refreshBoard();
  });
  socket.on('matches:updated', (payload) => {
    if (payload?.event_id && String(payload.event_id) !== String(eventId)) return;
    refreshBoard();
  });

  function noFightKey(ownerA, ownerB) {
    const first = Number(ownerA);
    const second = Number(ownerB);
    return first < second ? `${first}:${second}` : `${second}:${first}`;
  }

  function noFightBlocked(ownerA, ownerB) {
    return noFightKeys.has(noFightKey(ownerA, ownerB));
  }

  function setNoFightKeys(keys) {
    noFightKeys = new Set(keys || []);
  }

  function showAlert(type, message) {
    alertBox.className = `alert alert-${type}`;
    alertBox.textContent = message;
    alertBox.classList.remove('d-none');
  }

  function clearAlert() {
    alertBox.classList.add('d-none');
    alertBox.textContent = '';
  }

  function selected(zone) {
    return zone.querySelector('.chicken-card');
  }

  function updatePoolCount() {
    document.getElementById('poolCount').textContent = availableList.querySelectorAll('.chicken-card').length;
  }

  function isRecommendedOpponent(anchor, candidate) {
    if (!anchor || !candidate) return false;
    if (candidate.dataset.id === anchor.dataset.id) return false;
    if (candidate.dataset.owner === anchor.dataset.owner) return false;
    if (noFightBlocked(anchor.dataset.owner, candidate.dataset.owner)) return false;
    if (candidate.dataset.type !== anchor.dataset.type) return false;
    const difference = Math.abs(Number(anchor.dataset.weight) - Number(candidate.dataset.weight));
    return difference <= giveTake;
  }

  function getPairIssues(meron, wala) {
    const issues = [];
    if (!meron || !wala) return issues;

    if (meron.dataset.id === wala.dataset.id) {
      issues.push('A Gamecock cannot be selected twice.');
      return issues;
    }
    if (meron.dataset.owner === wala.dataset.owner) {
      issues.push('Same owner cannot be matched.');
    }
    if (noFightBlocked(meron.dataset.owner, wala.dataset.owner)) {
      issues.push('These owners are marked as No Fight With each other.');
    }

    const difference = Math.abs(Number(meron.dataset.weight) - Number(wala.dataset.weight));
    if (difference > giveTake) {
      issues.push(`Weight difference is ${difference}g. Limit is ${giveTake}g. Passcode is required to confirm.`);
    }
    if (meron.dataset.type !== wala.dataset.type) {
      issues.push(`Mixed type manual match: LEFT SIDE is ${meron.dataset.type}; RIGHT SIDE is ${wala.dataset.type}. Passcode is required to confirm.`);
    }

    return issues;
  }

  function needsOverride(meron, wala) {
    if (!meron || !wala) return false;
    const difference = Math.abs(Number(meron.dataset.weight) - Number(wala.dataset.weight));
    return difference > giveTake || meron.dataset.type !== wala.dataset.type;
  }

  function updatePoolHighlights() {
    const meron = selected(meronZone);
    const wala = selected(walaZone);
    const anchor = meron || wala;

    availableList.querySelectorAll('.chicken-card').forEach((card) => {
      card.classList.remove('chicken-card--recommended', 'chicken-card--blocked', 'chicken-card--dimmed');

      if (recommendationFor) {
        card.classList.add('chicken-card--recommended');
        return;
      }

      if (!anchor || (meron && wala)) return;
      if (card.dataset.id === anchor.dataset.id) return;

      if (isRecommendedOpponent(anchor, card)) {
        card.classList.add('chicken-card--recommended');
      } else {
        card.classList.add('chicken-card--blocked');
      }
    });
  }

  function updateDifference() {
    const meron = selected(meronZone);
    const wala = selected(walaZone);

    if (!meron || !wala) {
      weightDiff.textContent = '0g';
      updatePoolHighlights();
      if (!meron && !wala) clearAlert();
      return;
    }

    const difference = Math.abs(Number(meron.dataset.weight) - Number(wala.dataset.weight));
    weightDiff.textContent = `${difference}g`;

    const issues = getPairIssues(meron, wala);
    const blockingIssues = issues.filter((issue) => !issue.includes('Passcode is required'));
    if (blockingIssues.length) {
      showAlert('danger', blockingIssues[0]);
    } else if (issues.length) {
      showAlert('warning', issues[0]);
    } else {
      clearAlert();
    }

    updatePoolHighlights();
  }

  function enforceSingle(evt) {
    if (evt.to.children.length > 1) {
      evt.from.appendChild(evt.item);
      showAlert('warning', 'Only one Gamecock is allowed per side.');
    }
    updateDifference();
  }

  function setupSortable() {
    [availableList, meronZone, walaZone].forEach((element) => {
      Sortable.create(element, {
        group: 'chickens',
        animation: 150,
        onAdd: enforceSingle,
        onRemove: updateDifference,
        onSort: updateDifference
      });
    });
  }

  async function recommendFor(card) {
    clearAlert();
    const currentMeron = selected(meronZone);
    const currentWala = selected(walaZone);

    if (!currentMeron) {
      recommendationFor = card.dataset.id;
      meronZone.appendChild(card);
      await refreshPool();
      updateDifference();
      return;
    }

    if (!currentWala) {
      walaZone.appendChild(card);
      updatePoolCount();
      updateDifference();
      return;
    }

    if (currentMeron.dataset.id !== card.dataset.id) {
      showAlert('warning', 'Clear LEFT SIDE or RIGHT SIDE before selecting another Gamecock.');
      return;
    }

    recommendationFor = card.dataset.id;
    await refreshPool();
    updateDifference();
  }

  async function showAllChickens() {
    recommendationFor = '';
    recommendationBar.classList.add('d-none');
    await refreshPool();
    updateDifference();
  }

  function renderPreviewItems(container, preview) {
    if (!preview?.length) {
      container.innerHTML = '<p class="small text-white-50 mb-0">No fights to create.</p>';
      return;
    }

    container.innerHTML = preview.map((pair) => `
      <article class="auto-match-preview-item">
        <div class="fight-label">Fight ${pair.fight_index}</div>
        <div><strong>LEFT:</strong> ${escapeHtml(pair.meron_owner)} / ${escapeHtml(pair.meron_entry)} / ${pair.meron_weight}g</div>
        <div><strong>RIGHT:</strong> ${escapeHtml(pair.wala_owner)} / ${escapeHtml(pair.wala_entry)} / ${pair.wala_weight}g</div>
        <div class="small text-white-50">Difference ${pair.difference}g</div>
      </article>
    `).join('');
  }

  function showAutoMatchPreview(payload) {
    document.getElementById('autoMatchPreviewSummary').textContent = payload.message;
    renderPreviewItems(document.getElementById('autoMatchPreviewList'), payload.preview);
    const skipText = payload.unmatched_count > 0
      ? `${payload.unmatched_count} eligible gamecock${payload.unmatched_count === 1 ? '' : 's'} will remain unmatched after auto match.`
      : 'All eligible gamecocks in the proposed set will be matched.';
    document.getElementById('autoMatchPreviewSkip').textContent = skipText;
    pendingAutoMatchPreview = payload;
    autoMatchPreviewModal.show();
  }

  function showAutoMatchResult(payload) {
    document.getElementById('autoMatchResultSummary').textContent = payload.message;
    renderPreviewItems(document.getElementById('autoMatchResultList'), payload.preview || []);
    const skipText = payload.unmatched_count > 0
      ? `${payload.unmatched_count} eligible gamecock${payload.unmatched_count === 1 ? '' : 's'} could not be paired.`
      : 'Every eligible gamecock in the proposed set was matched.';
    document.getElementById('autoMatchResultSkip').textContent = skipText;
    autoMatchResultModal.show();
  }

  async function submitConfirm(overridePasscode = '') {
    if (!pendingConfirm) return;

    confirmButton.disabled = true;
    try {
      const response = await fetch('/matching/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: eventId,
          meron_chicken_id: pendingConfirm.meron.dataset.id,
          wala_chicken_id: pendingConfirm.wala.dataset.id,
          override_passcode: overridePasscode
        })
      });
      const payload = await response.json();
      if (!payload.ok) {
        showAlert('danger', payload.message);
        return;
      }
      showAlert('success', payload.message);
      pendingConfirm = null;
      await refreshBoard();
    } catch (error) {
      showAlert('danger', 'Unable to confirm match.');
    } finally {
      confirmButton.disabled = false;
    }
  }

  async function confirmMatch() {
    clearAlert();
    const meron = selected(meronZone);
    const wala = selected(walaZone);

    if (!meron || !wala) {
      showAlert('warning', 'Select one LEFT SIDE and one RIGHT SIDE Gamecock.');
      return;
    }

    const issues = getPairIssues(meron, wala);
    const blockingIssues = issues.filter((issue) => !issue.includes('Passcode is required'));
    if (blockingIssues.length) {
      showAlert('danger', blockingIssues[0]);
      return;
    }

    pendingConfirm = { meron, wala };

    if (needsOverride(meron, wala)) {
      document.getElementById('overridePasscodeReason').textContent = issues.filter((issue) => issue.includes('Passcode')).join(' ');
      document.getElementById('overridePasscodeInput').value = '';
      overridePasscodeModal.show();
      return;
    }

    await submitConfirm();
  }

  async function runAutoMatchCommit() {
    autoMatchButton.disabled = true;
    document.getElementById('autoMatchPreviewConfirm').disabled = true;
    try {
      const response = await fetch('/matching/auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId })
      });
      const payload = await response.json();
      autoMatchPreviewModal.hide();
      if (!payload.ok) {
        showAlert('warning', payload.message || 'No valid auto matches found.');
        return;
      }
      showAutoMatchResult(payload);
      await refreshBoard();
    } catch (error) {
      showAlert('danger', 'Unable to auto match.');
    } finally {
      autoMatchButton.disabled = false;
      document.getElementById('autoMatchPreviewConfirm').disabled = false;
      pendingAutoMatchPreview = null;
    }
  }

  async function autoMatch() {
    clearAlert();
    autoMatchButton.disabled = true;
    try {
      const response = await fetch('/matching/auto/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId })
      });
      const payload = await response.json();
      if (!payload.ok) {
        showAlert('warning', payload.message || 'No valid auto matches found.');
        return;
      }
      showAutoMatchPreview(payload);
    } catch (error) {
      showAlert('danger', 'Unable to load auto match preview.');
    } finally {
      autoMatchButton.disabled = false;
    }
  }

  async function unmatch(matchId) {
    clearAlert();
    if (!window.confirm('Remove this match and return both Gamecocks to the available pool?')) return;

    try {
      const response = await fetch(`/matching/${encodeURIComponent(matchId)}`, {
        method: 'DELETE',
        headers: { 'Accept': 'application/json' }
      });
      const payload = await response.json();
      if (!payload.ok) {
        showAlert('danger', payload.message || 'Unable to remove match.');
        return;
      }
      showAlert('success', payload.message);
      await refreshBoard();
    } catch (error) {
      showAlert('danger', 'Unable to remove match.');
    }
  }

  async function removeUnfought() {
    clearAlert();
    if (!window.confirm('Remove all unfought matches for this event and return their Gamecocks to the available pool?')) return;

    removeUnfoughtButton.disabled = true;
    try {
      const response = await fetch('/matching/unfought', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId })
      });
      const payload = await response.json();
      if (!payload.ok) {
        showAlert('danger', payload.message || 'Unable to remove unfought matches.');
        return;
      }
      showAlert(payload.deleted_count ? 'success' : 'info', payload.message);
      await refreshBoard();
    } catch (error) {
      showAlert('danger', 'Unable to remove unfought matches.');
    } finally {
      removeUnfoughtButton.disabled = false;
    }
  }

  function resetBoard() {
    [meronZone, walaZone].forEach((zone) => {
      Array.from(zone.children).forEach((card) => availableList.appendChild(card));
    });
    recommendationFor = '';
    recommendationBar.classList.add('d-none');
    updateDifference();
    clearAlert();
    refreshPool();
  }

  async function refreshBoard() {
    recommendationFor = '';
    recommendationBar.classList.add('d-none');
    const params = new URLSearchParams(window.location.search);
    params.set('event_id', eventId);

    const [poolResponse, matchesResponse] = await Promise.all([
      fetch(`/matching/api/pool?${params.toString()}`),
      fetch(`/matching/api/matches?event_id=${encodeURIComponent(eventId)}`)
    ]);
    const poolPayload = await poolResponse.json();
    const matchesPayload = await matchesResponse.json();

    if (poolPayload.no_fight_keys) setNoFightKeys(poolPayload.no_fight_keys);
    availableList.innerHTML = poolPayload.chickens.map((chicken) => renderChicken(chicken, poolPayload.recommended)).join('');
    document.getElementById('poolCount').textContent = poolPayload.chickens.length;
    document.getElementById('matchesList').innerHTML = matchesPayload.matches.map(renderMatch).join('');
    document.getElementById('matchCount').textContent = matchesPayload.matches.length;
    meronZone.innerHTML = '';
    walaZone.innerHTML = '';
    updateDifference();
  }

  async function refreshPool() {
    const params = new URLSearchParams(window.location.search);
    params.set('event_id', eventId);
    if (recommendationFor) params.set('recommend_for', recommendationFor);
    else params.delete('recommend_for');

    const response = await fetch(`/matching/api/pool?${params.toString()}`);
    const payload = await response.json();
    if (!payload.ok) {
      showAlert('danger', payload.message || 'Unable to load recommendations.');
      return;
    }

    if (payload.no_fight_keys) setNoFightKeys(payload.no_fight_keys);
    availableList.innerHTML = payload.chickens.map((chicken) => renderChicken(chicken, payload.recommended)).join('');
    document.getElementById('poolCount').textContent = payload.chickens.length;

    if (payload.recommended) {
      const base = payload.base_chicken;
      recommendationText.textContent = `${payload.chickens.length} recommended for ${base.owner_name} / ${base.entry_name} #${base.entry_no} (${base.type}, ${base.weight}g)`;
      recommendationBar.classList.remove('d-none');
      if (!payload.chickens.length) {
        showAlert('warning', 'No recommended opponents found for the selected Gamecock.');
      }
    } else {
      recommendationBar.classList.add('d-none');
    }

    updatePoolHighlights();
  }

  function renderChicken(chicken, recommended = false) {
    const highlightClass = recommended ? ' chicken-card--recommended' : '';
    return `
      <div class="chicken-card${highlightClass}" data-id="${chicken.chicken_id}" data-weight="${chicken.weight}" data-owner="${chicken.owner_id}" data-type="${chicken.type}">
        <div class="d-flex justify-content-between gap-2">
          <strong>${escapeHtml(chicken.owner_name)}</strong>
          <span>${chicken.weight}g</span>
        </div>
        <div class="small text-white-50">${escapeHtml(chicken.entry_name)} #${chicken.entry_no} / ${chicken.type}</div>
        <div class="band-line">WB ${escapeHtml(chicken.wingband)} / LB ${escapeHtml(chicken.legband)}</div>
        <button type="button" class="btn btn-sm btn-outline-light recommend-btn">Recommend</button>
      </div>
    `;
  }

  function renderMatch(match) {
    const actions = ['pending', 'confirmed'].includes(match.status)
      ? '<button type="button" class="btn btn-sm btn-outline-warning w-100 mt-2 unmatch-btn">Change / Unmatch</button>'
      : '';

    return `
      <article class="match-card" data-match-id="${match.match_id}">
        <div class="fight-no">Fight #${match.fight_no}</div>
        <div><strong>LEFT SIDE:</strong> ${escapeHtml(match.meron_owner)} / ${match.meron_weight}g</div>
        <div><strong>RIGHT SIDE:</strong> ${escapeHtml(match.wala_owner)} / ${match.wala_weight}g</div>
        <div class="small text-white-50">Difference ${match.weight_difference}g / ${match.status}</div>
        ${actions}
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

  setupSortable();
  confirmButton.addEventListener('click', confirmMatch);
  autoMatchButton.addEventListener('click', autoMatch);
  removeUnfoughtButton.addEventListener('click', removeUnfought);
  resetButton.addEventListener('click', resetBoard);
  showAllButton.addEventListener('click', showAllChickens);
  document.getElementById('overridePasscodeConfirm').addEventListener('click', async () => {
    const passcode = document.getElementById('overridePasscodeInput').value.trim();
    overridePasscodeModal.hide();
    await submitConfirm(passcode);
  });
  document.getElementById('autoMatchPreviewConfirm').addEventListener('click', runAutoMatchCommit);
  document.getElementById('overridePasscodeInput').addEventListener('keydown', async (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      document.getElementById('overridePasscodeConfirm').click();
    }
  });
  availableList.addEventListener('click', (event) => {
    const button = event.target.closest('.recommend-btn');
    if (!button) return;
    const card = button.closest('.chicken-card');
    if (card) recommendFor(card);
  });
  matchesList.addEventListener('click', (event) => {
    const button = event.target.closest('.unmatch-btn');
    if (!button) return;
    const card = button.closest('.match-card');
    if (card) unmatch(card.dataset.matchId);
  });
  updatePoolHighlights();
})();
