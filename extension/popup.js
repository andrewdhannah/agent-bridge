/**
 * Agent Bridge — Popup Script (AB-9)
 *
 * Manages tab navigation (Submit / Review), persistent pairing status,
 * pairing revoke/reset, and decision review summary.
 *
 * AB-9 governing line:
 *   Pairing proves client trust.
 *   Context explains evidence.
 *   Neither grants authority.
 *
 * Read-only: no mutations, no authority fields.
 */

const BRIDGE_URL = 'http://127.0.0.1:3457';

// ── Init ───────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initPairingBar();
  initTabs();
  initSubmitTab();
  initReviewTab();
});

// ── Pairing Persistence (AB-9) ─────────────────────────────────────────

/**
 * Pairing state for the extension.
 * Persisted in chrome.storage.local as 'bridgePairing'.
 * Auto-discovered from bridge via GET /api/pairing/info.
 * Revocable by user — clearing storage forces re-discovery.
 */

async function loadPairingConfig() {
  // First try chrome.storage.local (persistent across reload)
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

    // Persist for future use
    try {
      await chrome.storage.local.set({ bridgePairing: config });
    } catch {
      // Non-fatal — caching is optional
    }

    return config;
  } catch {
    return null;
  }
}

async function resetPairing() {
  // Clear stored pairing and refresh UI
  try {
    await chrome.storage.local.remove('bridgePairing');
  } catch {
    // Non-fatal
  }
  updatePairingUI(null);
  initPairingBar(); // re-check
}

async function getPairingStatus() {
  const config = await loadPairingConfig();
  return config ? { paired: true, clientId: config.clientId } : { paired: false, clientId: null };
}

// ── Pairing Status Bar UI ──────────────────────────────────────────────

async function initPairingBar() {
  const dot = document.getElementById('pairing-dot');
  const label = document.getElementById('pairing-label');
  const client = document.getElementById('pairing-client');
  const revokeBtn = document.getElementById('pairing-revoke-btn');

  try {
    const config = await loadPairingConfig();
    updatePairingUI(config);

    revokeBtn.addEventListener('click', async () => {
      await resetPairing();
    });
  } catch {
    setPairingState(dot, label, client, revokeBtn, 'error', 'Pairing error');
  }
}

function updatePairingUI(config) {
  const dot = document.getElementById('pairing-dot');
  const label = document.getElementById('pairing-label');
  const client = document.getElementById('pairing-client');
  const revokeBtn = document.getElementById('pairing-revoke-btn');

  if (config) {
    setPairingState(dot, label, client, revokeBtn, 'paired', 'Paired', config.clientId);
  } else {
    setPairingState(dot, label, client, revokeBtn, 'unpaired', 'Not paired — start bridge');
  }
}

function setPairingState(dot, label, client, revokeBtn, state, text, clientId) {
  dot.className = 'pairing-dot pairing-dot--' + state;
  label.textContent = text;
  if (clientId) {
    client.textContent = clientId.length > 20 ? clientId.slice(0, 18) + '…' : clientId;
    client.style.display = '';
    revokeBtn.style.display = '';
  } else {
    client.textContent = '';
    client.style.display = 'none';
    revokeBtn.style.display = 'none';
  }
}

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

      tabs.forEach(t => t.classList.remove('tab--active'));
      tab.classList.add('tab--active');

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
      statusMsg.textContent = 'Not paired.';
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
