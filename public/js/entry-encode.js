(function () {
  const form = document.getElementById('chickenEncodeForm');
  if (!form) return;

  const typeInput = document.getElementById('chickenType');
  const weightInput = document.getElementById('chickenWeight');
  const weightHelp = document.getElementById('weightHelp');

  function limitsFor(type) {
    return {
      min: Number(form.dataset[`${type}Min`]),
      max: Number(form.dataset[`${type}Max`]),
      allowed: form.dataset[`${type}Allowed`] === '1'
    };
  }

  function applyLimits() {
    const type = typeInput.value;
    const limits = limitsFor(type);
    weightInput.min = limits.min;
    weightInput.max = limits.max;
    weightHelp.textContent = limits.allowed
      ? `Allowed ${type} weight: ${limits.min}g to ${limits.max}g.`
      : `${type} is not allowed for this event.`;
  }

  typeInput.addEventListener('change', applyLimits);
  form.addEventListener('submit', (event) => {
    const type = typeInput.value;
    const limits = limitsFor(type);
    const weight = Number(weightInput.value);

    if (!limits.allowed || weight < limits.min || weight > limits.max) {
      event.preventDefault();
      weightInput.classList.add('is-invalid');
      weightHelp.classList.add('text-danger');
      weightHelp.textContent = `${type} weight must be between ${limits.min}g and ${limits.max}g.`;
      return;
    }

    weightInput.classList.remove('is-invalid');
    weightHelp.classList.remove('text-danger');
  });

  const selectedOption = typeInput.options[typeInput.selectedIndex];
  const firstAllowed = Array.from(typeInput.options).find((option) => !option.disabled);
  if (selectedOption?.disabled && firstAllowed) typeInput.value = firstAllowed.value;
  applyLimits();
})();
