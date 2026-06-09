/**
 * Agent Bridge — Popup Script (AB-8)
 *
 * Manages tab navigation (Submit / Review) and loads the decision
 * review summary in the Review panel.
 *
 * Read-only: no mutations, no authority fields.
 */

const BRIDGE_URL = 'http://127.0.0.1:3457';

document.addEventListener('DOMContentLoaded', () => {
  // ── Tab navigation ──────────────────────────────────────────────
  initTabs();

  // ── Submit tab ──────────────────────────────────────────────────
  initSubmitTab();

  // ── Review tab ──────────────────────────────────────────────────
  initReviewTab();
});

// ── Tab Navigation ───────────────────────────────────────────────────

function initTabs() {
  const tabs = document.querySelectorAll('.tab');
  const panels = {
    submit: document.getElementById('panel-submit'),
    review: document.getElementById('panel-review'),
  };

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      if (!target || !panels[target]) return;

      // Update tab states
      tabs.forEach(t => t.classList.remove('tab--active'));
      tab.classList.add('tab--active');

      // Update panel visibility
      Object.values(panels).forEach(p => p.classList.add('tab-panel--hidden'));
      panels[target].classList.remove('tab-panel--hidden');
    });
  });
}

// ── Submit Tab ───────────────────────────────────────────────────────

function initSubmitTab() {
  const promptEl = document.getElementById('prompt');
  const submitBtn = document.getElementById('submit');
  const statusEl = document.getElementById('status');

  if (!promptEl || !submitBtn || !statusEl) return;

  submitBtn.addEventListener('click', async () => {
    const prompt = promptEl.value.trim();
    if (!prompt) {
      showStatus(statusEl, 'Please enter a prompt.', 'error');
      return;
    }

    submitBtn.disabled = true;
    showStatus(statusEl, 'Sending...', '');

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'submit_prompt',
        source: 'chatgpt',
        threadTitle: document.title || 'Untitled',
        prompt,
      });

      if (response.ok) {
        showStatus(statusEl, `Queued! Packet ID: ${response.packetId}`, 'success');
        promptEl.value = '';
      } else {
        showStatus(statusEl, `Error: ${response.error}`, 'error');
      }
    } catch (err) {
      showStatus(statusEl, `Error: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });
}

// ── Review Tab ───────────────────────────────────────────────────────

async function initReviewTab() {
  const openBtn = document.getElementById('open-review-btn');
  const statusMsg = document.getElementById('review-status-msg');

  // Open full review page in new tab
  openBtn.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('review.html') });
  });

  // Load mini summary from /api/status
  try {
    const config = await loadPairingConfig();
    if (!config) {
      statusMsg.textContent = 'Not paired. Run bridge-pair.js.';
      return;
    }

    const signedHeader = await createSignedHeader(config.clientId, config.clientSecret, 'GET', '/api/status');

    const response = await fetch(`${BRIDGE_URL}/api/status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Signed-Request': signedHeader,
      },
    });

    if (!response.ok) {
      statusMsg.textContent = `Bridge unavailable (${response.status})`;
      return;
    }

    const payload = await response.json();

    // Update queue counts in review summary
    if (payload.queue) {
      setText('r-incoming', payload.queue.incoming ?? '—');
      setText('r-approved', payload.queue.approved ?? '—');
      setText('r-in-progress', payload.queue['in-progress'] ?? '—');
      setText('r-complete', payload.queue.complete ?? '—');
      setText('r-rejected', payload.queue.rejected ?? '—');
    }

    // Update status message
    const recordCount = payload.custody?.total ?? 0;
    const libStatus = payload.librarianHealth || 'disconnected';
    if (recordCount > 0) {
      statusMsg.textContent = `${recordCount} custody record${recordCount > 1 ? 's' : ''} — Librarian ${libStatus}`;
    } else if (libStatus === 'connected') {
      statusMsg.textContent = 'No custody records yet.';
    } else {
      statusMsg.textContent = 'Librarian not reachable.';
    }
  } catch (err) {
    statusMsg.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function showStatus(el, text, cls) {
  el.textContent = text;
  el.className = cls;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

async function loadPairingConfig() {
  // First try chrome.storage.local (fast, works offline)
  try {
    const result = await chrome.storage.local.get('bridgePairing');
    if (result.bridgePairing) return result.bridgePairing;
  } catch {
    // Fall through to bridge fetch
  }

  // Fetch from bridge server (localhost only — safe)
  try {
    const resp = await fetch(`${BRIDGE_URL}/api/pairing/info`);
    if (!resp.ok) return null;
    const config = await resp.json();

    // Cache for future use
    try {
      await chrome.storage.local.set({ bridgePairing: config });
    } catch {
      // Non-fatal
    }

    return config;
  } catch {
    return null;
  }
}

async function createSignedHeader(clientId, secret, method, path) {
  const timestamp = new Date().toISOString();
  const nonce = crypto.randomUUID();
  const payload = [method, path, timestamp, nonce, ''].join('\n');

  const enc = new TextEncoder();
  const keyData = enc.encode(secret);
  const payloadData = enc.encode(payload);

  const key = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );

  const sig = await crypto.subtle.sign('HMAC', key, payloadData);

  const signature = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return JSON.stringify({ clientId, timestamp, nonce, signature });
}
