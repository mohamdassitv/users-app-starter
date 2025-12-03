
// Theme toggle
const root = document.documentElement;
const themeBtn = document.getElementById('themeToggle');
const saved = localStorage.getItem('theme') || 'dark';
if (saved === 'light') root.classList.add('light');
themeBtn?.addEventListener('click', () => {
  root.classList.toggle('light');
  localStorage.setItem('theme', root.classList.contains('light') ? 'light' : 'dark');
});

// Copy buttons
function attachCopy(node, val) {
  node.addEventListener('click', async () => {
    const text = val || node.dataset.cmd || node.innerText;
    try {
      await navigator.clipboard.writeText(text);
      const old = node.innerText;
      node.innerText = 'Copied!';
      setTimeout(() => (node.innerText = old || 'Copy'), 800);
    } catch (e) {
      alert('Copy failed: ' + e);
    }
  });
}

document.querySelectorAll('.copy').forEach(btn => attachCopy(btn, btn.dataset.cmd));
document.querySelectorAll('.cmd-inline').forEach(span => attachCopy(span, span.dataset.cmd));

// Tabs
document.querySelectorAll('.tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const panes = btn.closest('.console').querySelectorAll('.pane');
    panes.forEach(p => p.classList.remove('active'));
    const target = document.getElementById(tab);
    if (target) target.classList.add('active');
  });
});
