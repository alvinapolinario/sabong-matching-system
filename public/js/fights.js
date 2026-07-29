(function () {
  const reportBody = document.getElementById('fightReportBody');
  const statusBody = document.getElementById('fightStatusBody');
  const reportWrap = document.querySelector('.fight-report-wrap');
  const alertBox = document.getElementById('fightOrderAlert');
  if (!reportBody || !reportWrap || !window.Sortable) return;

  const eventId = reportWrap.dataset.eventId;
  let ignoreSocketRefreshUntil = 0;
  let refreshTimer = null;

  const socket = window.io?.();
  if (socket && eventId) {
    socket.emit('event:join', eventId);

    function isCurrentEvent(payload) {
      if (!payload?.event_id) return true;
      return String(payload.event_id) === String(eventId);
    }

    function scheduleSocketRefresh() {
      if (Date.now() < ignoreSocketRefreshUntil) return;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => window.location.reload(), 400);
    }

    ['fights:updated', 'matches:updated', 'match:created', 'match:deleted', 'pool:updated', 'tv:updated'].forEach((eventName) => {
      socket.on(eventName, (payload) => {
        if (isCurrentEvent(payload)) scheduleSocketRefresh();
      });
    });
  }

  function markLocalUpdate() {
    ignoreSocketRefreshUntil = Date.now() + 1500;
  }

  function showAlert(type, message) {
    alertBox.className = `alert alert-${type} no-print`;
    alertBox.textContent = message;
    alertBox.classList.remove('d-none');
  }

  async function submitForm(form) {
    const response = await fetch(form.action, {
      method: form.method || 'POST',
      headers: { 'Accept': 'application/json' },
      body: new URLSearchParams(new FormData(form))
    });

    if (!response.ok) throw new Error('Request failed.');
  }

  function rows(body) {
    return Array.from(body.querySelectorAll('tr[data-match-id]'));
  }

  function orderedIds(body = reportBody) {
    return rows(body).map((row) => row.dataset.matchId);
  }

  function showTvControls(row) {
    statusBody.querySelectorAll('.tv-side-radio-form, .tv-active-note').forEach((element) => {
      element.classList.add('d-none');
    });
    row.querySelectorAll('.tv-side-radio-form, .tv-active-note').forEach((element) => {
      element.classList.remove('d-none');
    });
  }

  function markActiveRadio(input) {
    statusBody.querySelectorAll('.tv-active-form input[type="radio"]').forEach((radio) => {
      radio.checked = radio === input;
    });
  }

  function markTvSideRadio(input) {
    const row = input.closest('tr');
    if (!row) return;
    row.querySelectorAll('.tv-side-radio-form input[type="radio"]').forEach((radio) => {
      radio.checked = radio === input;
    });
  }

  function normalizeTvRadios() {
    const activeRadio = statusBody.querySelector('.tv-active-form input[type="radio"]:checked');
    if (activeRadio) {
      markActiveRadio(activeRadio);
      showTvControls(activeRadio.closest('tr'));
    }

    rows(statusBody).forEach((row) => {
      const checkedSideRadio = row.querySelector('.tv-side-radio-form input[type="radio"]:checked');
      if (checkedSideRadio) markTvSideRadio(checkedSideRadio);
    });
  }

  function markerSuffix(row) {
    return row.dataset.markerSuffix || '';
  }

  function markerHtml(row) {
    const suffix = markerSuffix(row);
    return suffix ? `<span class="match-marker">${suffix}</span>` : '';
  }

  function renumberRows() {
    rows(reportBody).forEach((row, index) => {
      const suffixHtml = markerHtml(row);
      row.querySelectorAll('.fight-no-cell').forEach((cell) => {
        cell.innerHTML = `${index + 1}${suffixHtml}`;
      });
    });
    if (statusBody) {
      rows(statusBody).forEach((row, index) => {
        const suffixHtml = markerHtml(row);
        const cell = row.querySelector('.fight-status-no');
        if (cell) cell.innerHTML = `<span class="drag-handle">☰</span> #${index + 1}${suffixHtml}`;
      });
    }
  }

  function syncReportOrder(matchIds) {
    const byId = new Map(rows(reportBody).map((row) => [row.dataset.matchId, row]));
    matchIds.forEach((id) => {
      const row = byId.get(id);
      if (row) reportBody.appendChild(row);
    });
  }

  async function saveOrder(sourceBody = reportBody) {
    if (sourceBody !== reportBody) syncReportOrder(orderedIds(sourceBody));
    renumberRows();
    try {
      const response = await fetch('/fights/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: eventId,
          match_ids: orderedIds(reportBody)
        })
      });
      const payload = await response.json();
      if (!payload.ok) {
        showAlert('danger', payload.message || 'Unable to save fight order.');
        return;
      }
      markLocalUpdate();
      showAlert('success', `${payload.message} You can print now.`);
    } catch (error) {
      showAlert('danger', 'Unable to save fight order.');
    }
  }

  Sortable.create(reportBody, {
    animation: 150,
    draggable: 'tr[data-match-id]',
    ghostClass: 'fight-row-ghost',
    chosenClass: 'fight-row-chosen',
    onEnd: () => saveOrder(reportBody)
  });

  if (statusBody) {
    normalizeTvRadios();

    Sortable.create(statusBody, {
      animation: 150,
      draggable: 'tr[data-match-id]',
      handle: '.drag-handle',
      ghostClass: 'fight-row-ghost',
      chosenClass: 'fight-row-chosen',
      onEnd: () => saveOrder(statusBody)
    });

    statusBody.addEventListener('change', async (event) => {
      const input = event.target.closest('.tv-active-form input[type="radio"], .tv-side-radio-form input[type="radio"]');
      if (!input) return;

      const form = input.closest('form');
      if (!form) return;

      input.disabled = true;
      try {
        await submitForm(form);
        markLocalUpdate();
        if (form.classList.contains('tv-active-form')) {
          markActiveRadio(input);
          showTvControls(form.closest('tr'));
        } else if (form.classList.contains('tv-side-radio-form')) {
          markTvSideRadio(input);
        }
        showAlert('success', 'TV display updated.');
      } catch (error) {
        showAlert('danger', 'Unable to update TV display.');
      } finally {
        input.disabled = false;
      }
    });
  }
})();
