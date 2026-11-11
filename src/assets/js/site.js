// Progressive enhancement only: the page is complete without this file.

// Mobile navigation
const toggle = document.querySelector('.nav-toggle');
const nav = document.getElementById('site-nav');
if (toggle && nav) {
  const setOpen = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
  };
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', (event) => {
    if (event.target.closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setOpen(false);
  });
}

// Reference filter by type
const chips = [...document.querySelectorAll('.ref-filters .chip')];
const refs = [...document.querySelectorAll('.ref')];
const groups = [...document.querySelectorAll('.ref-group')];
for (const chip of chips) {
  chip.addEventListener('click', () => {
    const filter = chip.dataset.filter;
    for (const other of chips) {
      const active = other === chip;
      other.classList.toggle('is-active', active);
      other.setAttribute('aria-pressed', String(active));
    }
    for (const ref of refs) ref.hidden = filter !== 'all' && ref.dataset.type !== filter;
    for (const group of groups) group.hidden = !group.querySelector('.ref:not([hidden])');
  });
}
