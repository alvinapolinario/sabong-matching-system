(function () {
  if (!window.TomSelect) return;

  document.querySelectorAll('select.form-select').forEach((select) => {
    if (select.tomselect || select.dataset.noSearch === 'true') return;

    const firstOption = select.querySelector('option');
    const placeholder = firstOption && !firstOption.value ? firstOption.textContent.trim() : 'Search...';

    new TomSelect(select, {
      allowEmptyOption: true,
      create: false,
      maxOptions: 1000,
      placeholder,
      searchField: ['text'],
      sortField: [{ field: '$order' }],
      plugins: {
        dropdown_input: {}
      }
    });
  });
})();
