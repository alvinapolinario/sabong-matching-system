(function () {
  const grid = document.querySelector('.matching-grid');
  if (!grid) return;

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
  const socket = window.io();
  let recommendationFor = '';

  socket.emit('event:join', eventId);
  socket.on('pool:updated', refreshBoard);
  socket.on('match:created', refreshBoard);
  socket.on('match:deleted', refreshBoard);

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

  function enforceSingle(evt) {
    if (evt.to.children.length > 1) {
      evt.from.appendChild(evt.item);
      showAlert('warning', 'Only one Gamecock is allowed per side.');
    }
    updateDifference();
  }

  function updateDifference() {
    const meron = selected(meronZone);
    const wala = selected(walaZone);
    if (!meron || !wala) {
      weightDiff.textContent = '0g';
      return;
    }

    const difference = Math.abs(Number(meron.dataset.weight) - Number(wala.dataset.weight));
    weightDiff.textContent = `${difference}g`;
    if (difference > giveTake) {
      showAlert('warning', `Weight difference is ${difference}g. Limit is ${giveTake}g. Passcode is required to confirm.`);
    } else if (meron.dataset.type !== wala.dataset.type) {
      showAlert(
        'warning',
        `Mixed type manual match: LEFT SIDE is ${meron.dataset.type}; RIGHT SIDE is ${wala.dataset.type}. Passcode is required to confirm.`
      );
    } else {
      clearAlert();
    }
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

  async function confirmMatch() {
    clearAlert();
    const meron = selected(meronZone);
    const wala = selected(walaZone);

    if (!meron || !wala) {
      showAlert('warning', 'Select one LEFT SIDE and one RIGHT SIDE Gamecock.');
      return;
    }

    if (meron.dataset.id === wala.dataset.id) {
      showAlert('warning', 'A Gamecock cannot be selected twice.');
      return;
    }

    if (meron.dataset.owner === wala.dataset.owner) {
      showAlert('warning', 'Same owner cannot be matched.');
      return;
    }

    const difference = Math.abs(Number(meron.dataset.weight) - Number(wala.dataset.weight));
    let overridePasscode = '';
    const needsWeightOverride = difference > giveTake;
    const needsTypeOverride = meron.dataset.type !== wala.dataset.type;
    if (needsWeightOverride || needsTypeOverride) {
      const reasons = [];
      if (needsWeightOverride) reasons.push(`Weight difference ${difference}g exceeds ${giveTake}g limit`);
      if (needsTypeOverride) reasons.push(`Mixed type: LEFT SIDE ${meron.dataset.type}, RIGHT SIDE ${wala.dataset.type}`);
      overridePasscode = window.prompt(
        `Manual override requires confirmation passcode.\n${reasons.join('\n')}`
      );
      if (overridePasscode === null) {
        showAlert('warning', 'Manual override confirmation cancelled.');
        return;
      }
    }

    confirmButton.disabled = true;
    try {
      const response = await fetch('/matching/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: eventId,
          meron_chicken_id: meron.dataset.id,
          wala_chicken_id: wala.dataset.id,
          override_passcode: overridePasscode
        })
      });
      const payload = await response.json();
      if (!payload.ok) {
        showAlert('danger', payload.message);
        return;
      }
      showAlert('success', payload.message);
      await refreshBoard();
    } catch (error) {
      showAlert('danger', 'Unable to confirm match.');
    } finally {
      confirmButton.disabled = false;
    }
  }

  async function autoMatch() {
    clearAlert();
    if (!window.confirm('Automatically match all valid available Gamecocks for this event?')) return;

    autoMatchButton.disabled = true;
    try {
      const response = await fetch('/matching/auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId })
      });
      const payload = await response.json();
      if (!payload.ok) {
        showAlert('warning', payload.message || 'No valid auto matches found.');
        return;
      }
      const alertType = payload.unmatched_count > 0 ? 'info' : 'success';
      showAlert(alertType, payload.message);
      await refreshBoard();
    } catch (error) {
      showAlert('danger', 'Unable to auto match.');
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

    availableList.innerHTML = poolPayload.chickens.map(renderChicken).join('');
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

    availableList.innerHTML = payload.chickens.map(renderChicken).join('');
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
  }

  function renderChicken(chicken) {
    return `
      <div class="chicken-card" data-id="${chicken.chicken_id}" data-weight="${chicken.weight}" data-owner="${chicken.owner_id}" data-type="${chicken.type}">
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
})();
