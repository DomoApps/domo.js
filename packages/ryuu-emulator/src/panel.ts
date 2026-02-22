import type { LogEntry } from './types';

const PANEL_ID = '__domo_emulator__';
const MAX_LOG_ENTRIES = 10;

export function createPanel(options: {
  onSendFilters: () => void;
  onSendVariables: () => void;
  onSendDataUpdate: () => void;
  onSendAppData: () => void;
}): { updateLog: (entries: LogEntry[]) => void; remove: () => void } {
  const existing = document.getElementById(PANEL_ID);
  if (existing) existing.remove();

  const container = document.createElement('div');
  container.id = PANEL_ID;
  container.style.cssText = [
    'position:fixed',
    'bottom:16px',
    'right:16px',
    'z-index:2147483647',
    'font-family:monospace',
    'font-size:12px',
    'background:#1a1a2e',
    'color:#e0e0e0',
    'border-radius:8px',
    'box-shadow:0 4px 24px rgba(0,0,0,0.5)',
    'min-width:280px',
    'max-width:380px',
    'overflow:hidden',
  ].join(';');

  const header = document.createElement('div');
  header.style.cssText = [
    'display:flex',
    'align-items:center',
    'justify-content:space-between',
    'padding:8px 12px',
    'background:#16213e',
    'cursor:pointer',
    'user-select:none',
  ].join(';');

  const title = document.createElement('span');
  title.textContent = '🔌 Domo Emulator';
  title.style.cssText = 'font-weight:bold;color:#00d4ff;';

  const toggleBtn = document.createElement('button');
  toggleBtn.textContent = '▼';
  toggleBtn.style.cssText = [
    'background:none',
    'border:none',
    'color:#00d4ff',
    'cursor:pointer',
    'font-size:14px',
    'padding:0',
    'line-height:1',
  ].join(';');

  header.appendChild(title);
  header.appendChild(toggleBtn);

  const body = document.createElement('div');
  body.style.cssText = 'padding:10px 12px;';

  const btnStyle = [
    'display:inline-block',
    'margin:3px 4px 3px 0',
    'padding:4px 10px',
    'border-radius:4px',
    'border:1px solid #00d4ff',
    'background:transparent',
    'color:#00d4ff',
    'cursor:pointer',
    'font-size:11px',
    'font-family:monospace',
    'transition:background 0.15s',
  ].join(';');

  const btnHover = 'background:#00d4ff;color:#1a1a2e;';

  function makeBtn(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = btnStyle;
    btn.addEventListener('mouseover', () => (btn.style.cssText = btnStyle + btnHover));
    btn.addEventListener('mouseout', () => (btn.style.cssText = btnStyle));
    btn.addEventListener('click', onClick);
    return btn;
  }

  const actionsRow = document.createElement('div');
  actionsRow.style.cssText = 'margin-bottom:8px;';
  actionsRow.appendChild(makeBtn('Send Filters', options.onSendFilters));
  actionsRow.appendChild(makeBtn('Send Variables', options.onSendVariables));
  actionsRow.appendChild(makeBtn('Send Data Update', options.onSendDataUpdate));
  actionsRow.appendChild(makeBtn('Send App Data', options.onSendAppData));

  const logLabel = document.createElement('div');
  logLabel.textContent = 'Message log';
  logLabel.style.cssText = 'color:#888;margin-bottom:4px;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;';

  const logContainer = document.createElement('div');
  logContainer.style.cssText = [
    'max-height:140px',
    'overflow-y:auto',
    'background:#0f0f1a',
    'border-radius:4px',
    'padding:4px 6px',
  ].join(';');

  const emptyMsg = document.createElement('div');
  emptyMsg.textContent = '(no messages yet)';
  emptyMsg.style.cssText = 'color:#555;font-style:italic;padding:2px 0;';
  logContainer.appendChild(emptyMsg);

  body.appendChild(actionsRow);
  body.appendChild(logLabel);
  body.appendChild(logContainer);

  container.appendChild(header);
  container.appendChild(body);
  document.body.appendChild(container);

  let collapsed = false;
  function toggleCollapse() {
    collapsed = !collapsed;
    body.style.display = collapsed ? 'none' : 'block';
    toggleBtn.textContent = collapsed ? '▲' : '▼';
  }
  header.addEventListener('click', toggleCollapse);

  function updateLog(entries: LogEntry[]) {
    logContainer.innerHTML = '';
    if (entries.length === 0) {
      logContainer.appendChild(emptyMsg.cloneNode(true));
      return;
    }
    const recent = entries.slice(-MAX_LOG_ENTRIES);
    for (const entry of recent) {
      const row = document.createElement('div');
      row.style.cssText = 'padding:2px 0;border-bottom:1px solid #222;word-break:break-all;';
      const arrow = entry.dir === 'in' ? '→' : '←';
      const color = entry.dir === 'in' ? '#4ade80' : '#f87171';
      const time = new Date(entry.at).toISOString().slice(11, 23);
      row.innerHTML =
        `<span style="color:${color}">${arrow} ${entry.event}</span>` +
        ` <span style="color:#666;font-size:10px">${time}</span>`;
      logContainer.appendChild(row);
    }
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  function remove() {
    container.remove();
  }

  return { updateLog, remove };
}
