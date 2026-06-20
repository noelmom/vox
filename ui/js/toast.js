/* Simple toast notification system */

export function toast(message, type = 'default', duration = 3500) {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast${type === 'error' ? ' toast-error' : type === 'success' ? ' toast-success' : ''}`;

  const icon = type === 'error' ? '✕' : type === 'success' ? '✓' : 'ℹ';
  el.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  container.appendChild(el);

  setTimeout(() => {
    el.classList.add('fade-out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, duration);
}

export const toastError   = (msg) => toast(msg, 'error');
export const toastSuccess = (msg) => toast(msg, 'success');
