/**
 * review.js — Decision Review Viewer Logic (AB-9).
 *
 * Fetches the read-only decision review payload from the bridge
 * and renders it into the review.html DOM.
 *
 * AB-9 governing line:
 *   Pairing proves client trust.
 *   Context explains evidence.
 *   Neither grants authority.
 *
 * Read-only: no mutations, no authority fields, no identity exposure.
 * Uses HMAC-SHA256 signed requests via persistent local pairing.
 */

const BRIDGE_URL = 'http://127.0.0.1:3457';

// ── DOM references (set after DOMContentLoaded) ──────────────────────

let els = {};

document.addEventListener('DOMContentLoaded', () => {
  els = {
    loading: document.getElementById('loading-state'),
    error: document.getElementById('error-state'),
    errorMsg: document.getElementById('error-message'),
    content: document.getElementById('review-content'),

    bridgeInstance: document.getElementById('bridge-instance'),
    reviewTimestamp: document.getElementById('review-timestamp'),
    librarianStatus: document.getElementById('librarian-status'),
    reviewStatus: document.getElementById('review-status'),

    qIncoming: document.getElementById('q-incoming'),
    qApproved: document.getElementById('q-approved'),
    qInProgress: document.getElementById('q-in-progress'),
    qComplete: document.getElementById('q-complete'),
    qRejected: document.getElementById('q-rejected'),

    recordCount: document.getElementById('record-count'),
    recordsContainer: document.getElementById('records-container'),

    // AB-9: Pairing bar
    pairingDot: document.getElementById('pairing-bar-dot'),
    pairingLabel: document.getElementById('pairing-bar-label'),
    pairingClient: document.getElementById('pairing-bar-client'),
    pairingRevoke: document.getElementById('pairing-bar-revoke'),
  };

  initPairingBar();
  loadReview();
});

// ── Pairing Persistence (AB-9) ─────────────────────────────────────────

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
  try {
    await chrome.storage.local.remove('bridgePairing');
  } catch {
    // Non-fatal
  }
  initPairingBar();
  showError('Pairing revoked. Reload to re-pair.');
}

async function initPairingBar() {
  try {
    const config = await loadPairingConfig();
    if (config) {
      els.pairingDot.className = 'pairing-bar__dot pairing-bar__dot--paired';
      els.pairingLabel.textContent = 'Paired';
      els.pairingClient.textContent = config.clientId.length > 24
        ? config.clientId.slice(0, 22) + '…' : config.clientId;
      els.pairingClient.style.display = '';
      els.pairingRevoke.style.display = '';
    } else {
      els.pairingDot.className = 'pairing-bar__dot pairing-bar__dot--unpaired';
      els.pairingLabel.textContent = 'Not paired';
      els.pairingClient.style.display = 'none';
      els.pairingRevoke.style.display = 'none';
    }
  } catch {
    els.pairingDot.className = 'pairing-bar__dot pairing-bar__dot--error';
    els.pairingLabel.textContent = 'Pairing error';
    els.pairingClient.style.display = 'none';
    els.pairingRevoke.style.display = 'none';
  }

  els.pairingRevoke.addEventListener('click', resetPairing);
}

// ── Load pairing config and fetch review data ────────────────────────

async function loadReview() {
  showLoading();

  try {
    const config = await loadPairingConfig();
    if (!config) {
      showError('No pairing config found. Run bridge-pair.js first.');
      return;
    }

    const signedHeader = await createSignedHeader(
      config.clientId,
      config.clientSecret,
      'GET',
      '/api/decisions'
    );

    const response = await fetch(`${BRIDGE_URL}/api/decisions`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Signed-Request': signedHeader,
      },
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      showError(`Bridge returned ${response.status}: ${body.error || body.detail || 'Unknown error'}`);
      return;
    }

    const payload = await response.json();
    renderReview(payload);
  } catch (err) {
    showError(`Failed to load: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Render the review payload ────────────────────────────────────────

function renderReview(payload) {
  // Validate payload shape
  if (payload.artifactType !== 'decision_review_payload') {
    showError('Unexpected payload format.');
    return;
  }

  // Header info
  els.bridgeInstance.textContent = payload.bridge?.instance || '—';
  els.reviewTimestamp.textContent = formatTimestamp(payload.generatedAt);

  // Librarian health badge
  const libHealth = payload.librarianHealth || 'unknown';
  els.librarianStatus.textContent = libHealth;
  els.librarianStatus.className = 'librarian-badge ' +
    (libHealth === 'connected' ? 'librarian-badge--in-custody' :
     libHealth === 'disconnected' ? 'librarian-badge--rejected' :
     'librarian-badge--incoming');

  // Review status badge
  const extStatus = payload.extensionVisibleStatus || 'unknown';
  els.reviewStatus.textContent = extStatus;
  els.reviewStatus.className = 'librarian-badge ' +
    (extStatus === 'review_ready' ? 'librarian-badge--approved' :
     extStatus === 'librarian_unreachable' ? 'librarian-badge--rejected' :
     extStatus === 'no_records_available' ? 'librarian-badge--incoming' :
     'librarian-badge--incoming');

  // Queue summary
  const qs = payload.queueSummary || {};
  els.qIncoming.textContent = qs.incoming ?? 0;
  els.qApproved.textContent = qs.approved ?? 0;
  els.qInProgress.textContent = qs['in-progress'] ?? 0;
  els.qComplete.textContent = qs.complete ?? 0;
  els.qRejected.textContent = qs.rejected ?? 0;

  // Record count
  const records = payload.records || [];
  els.recordCount.textContent = `${records.length} record${records.length !== 1 ? 's' : ''}`;

  // Render records
  renderRecords(records);

  showContent();
}

// ── Render decision records ──────────────────────────────────────────

function renderRecords(records) {
  const container = els.recordsContainer;

  if (records.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">&#128196;</div>
        <div class="empty-state__text">No decision records available.</div>
      </div>
    `;
    return;
  }

  let html = '';
  for (const record of records) {
    html += renderRecordCard(record);
  }

  container.innerHTML = html;

  // Attach expand events for truncated context
  container.querySelectorAll('.context-card__expand').forEach(btn => {
    btn.addEventListener('click', () => {
      const summary = btn.previousElementSibling;
      if (summary) {
        summary.classList.toggle('context-card__summary--truncated');
        btn.textContent = summary.classList.contains('context-card__summary--truncated')
          ? 'Show more' : 'Show less';
      }
    });
  });
}

function renderRecordCard(record) {
  const intentBadge = getIntentBadge(record.intentStatus);
  const custodyBadge = getCustodyBadge(record.custodyStatus);
  const integrityBadge = getIntegrityBadge(record.integrityStatus);

  return `
    <div class="record-card">
      <div class="record-card__header">
        <span class="record-card__id">${escapeHtml(record.recordId?.slice(0, 8) || '—')}</span>
        <div class="record-card__badges">
          <span class="${intentBadge.cls}">${intentBadge.label}</span>
          <span class="${custodyBadge.cls}">${custodyBadge.label}</span>
          <span class="${integrityBadge.cls}">${integrityBadge.label}</span>
        </div>
      </div>

      <!-- Provenance chain -->
      <div class="provenance-chain">
        ${renderProvenanceLink('Intent', record.intentId, record.intentStatus === 'recorded')}
        <span class="provenance-arrow">&rarr;</span>
        ${renderProvenanceLink('Custody', record.custodyId, !!record.custodyStatus)}
        <span class="provenance-arrow">&rarr;</span>
        ${renderProvenanceLink('Queue', record.sourceQueueItemId, !!record.queueState)}
      </div>

      <!-- AB-9: Context Card -->
      ${renderContextCard(record)}

      <!-- Details grid -->
      <div class="record-details">
        <div class="detail-field">
          <span class="detail-field__label">Intent Type</span>
          <span class="detail-field__value">${escapeHtml(record.intentType || '—')}</span>
        </div>
        <div class="detail-field">
          <span class="detail-field__label">Intent Timestamp</span>
          <span class="detail-field__value">${formatTimestamp(record.intentTimestamp)}</span>
        </div>
        <div class="detail-field">
          <span class="detail-field__label">Custody Status</span>
          <span class="detail-field__value">${escapeHtml(record.custodyStatus || '—')}</span>
        </div>
        <div class="detail-field">
          <span class="detail-field__label">Execution Permission</span>
          <span class="detail-field__value">${escapeHtml(record.custodyExecutionPermission || '—')}</span>
        </div>
        <div class="detail-field">
          <span class="detail-field__label">Queue State</span>
          <span class="detail-field__value">${escapeHtml(record.queueState || '—')}</span>
        </div>
        <div class="detail-field">
          <span class="detail-field__label">Queue Source</span>
          <span class="detail-field__value">${escapeHtml(record.queueSource || '—')}</span>
        </div>
      </div>
    </div>
  `;
}

// ── AB-9: Context Card ───────────────────────────────────────────────

function renderContextCard(record) {
  // Determine context source priority: custody > queue > audit
  const contextSummary = record.contextSummary;
  const contextSource = record.contextSource;
  const riskClass = record.riskClass;

  if (!contextSummary) {
    // Degraded state — no context available
    let reason = '';
    if (!record.queueState && !record.custodyStatus) {
      reason = 'No linked queue item or custody artifact.';
    } else if (!record.queueState) {
      reason = 'Queue item not found.';
    } else {
      reason = 'Context unavailable from linked sources.';
    }
    return `
      <div class="context-card">
        <div class="context-card__header">
          <span class="context-card__source">Context</span>
        </div>
        <div class="context-card--empty">${escapeHtml(reason)}</div>
      </div>
    `;
  }

  // Determine source tag color
  const sourceTag = contextSource === 'queue' ? 'Queue' :
    contextSource === 'custody' ? 'Custody' :
    contextSource === 'audit' ? 'Audit' : 'Evidence';

  // Truncate long summaries
  const needsTruncation = contextSummary.length > 120;
  const displaySummary = needsTruncation ? contextSummary : contextSummary;

  const riskBadge = riskClass && riskClass !== 'unknown'
    ? `<span class="context-card__meta-item">
         <span class="context-card__meta-label">Risk:</span>
         <span class="librarian-risk-badge librarian-risk-badge--${riskClass.toLowerCase()}">${escapeHtml(riskClass)}</span>
       </span>`
    : '';

  return `
    <div class="context-card">
      <div class="context-card__header">
        <span class="context-card__source">
          Context <span class="context-card__source-tag">source: ${sourceTag}</span>
        </span>
      </div>
      <div class="context-card__summary ${needsTruncation ? 'context-card__summary--truncated' : ''}">
        ${escapeHtml(contextSummary)}
      </div>
      ${needsTruncation ? '<button class="context-card__expand">Show more</button>' : ''}
      <div class="context-card__meta">
        <span class="context-card__meta-item">
          <span class="context-card__meta-label">Integrity:</span>
          ${escapeHtml(record.integrityStatus || '—')}
        </span>
        ${riskBadge}
      </div>
    </div>
  `;
}

function renderProvenanceLink(label, id, isAvailable) {
  if (!id) {
    return `<span class="provenance-link">${label}: <span style="color:var(--librarian-text-muted)">—</span></span>`;
  }
  const shortId = id.length > 12 ? id.slice(0, 12) + '…' : id;
  const style = isAvailable ? '' : 'color:var(--librarian-status-needs-review)';
  return `<span class="provenance-link">${label}: <span class="provenance-label" style="${style}" title="${escapeHtml(id)}">${escapeHtml(shortId)}</span></span>`;
}

// ── Badge helpers ────────────────────────────────────────────────────

function getIntentBadge(status) {
  switch (status) {
    case 'recorded':           return { cls: 'librarian-badge librarian-badge--intent-recorded', label: 'Intent Recorded' };
    case 'rejected':           return { cls: 'librarian-badge librarian-badge--rejected', label: 'Intent Rejected' };
    case 'no_intent_recorded': return { cls: 'librarian-badge librarian-badge--incoming', label: 'No Intent' };
    default:                   return { cls: 'librarian-badge librarian-badge--incoming', label: status || 'Unknown' };
  }
}

function getCustodyBadge(status) {
  switch (status) {
    case 'evidence_of_intent': return { cls: 'librarian-badge librarian-badge--in-custody', label: 'In Custody' };
    case null:                 return { cls: 'librarian-badge librarian-badge--incoming', label: 'No Custody' };
    default:                   return { cls: 'librarian-badge librarian-badge--in-custody', label: status || 'Unknown' };
  }
}

function getIntegrityBadge(status) {
  switch (status) {
    case 'consistent':   return { cls: 'librarian-badge librarian-badge--complete', label: 'Consistent' };
    case 'inconsistent': return { cls: 'librarian-badge librarian-badge--rejected', label: 'Inconsistent' };
    case 'incomplete':   return { cls: 'librarian-badge librarian-badge--needs-review', label: 'Incomplete' };
    default:             return { cls: 'librarian-badge librarian-badge--incoming', label: status || 'Unknown' };
  }
}

// ── UI state helpers ─────────────────────────────────────────────────

function showLoading() {
  els.loading.style.display = '';
  els.error.style.display = 'none';
  els.content.style.display = 'none';
}

function showError(msg) {
  els.loading.style.display = 'none';
  els.error.style.display = '';
  els.errorMsg.textContent = msg;
  els.content.style.display = 'none';
}

function showContent() {
  els.loading.style.display = 'none';
  els.error.style.display = 'none';
  els.content.style.display = '';
}

// ── HMAC Signing ─────────────────────────────────────────────────────

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

// ── General helpers ──────────────────────────────────────────────────

function formatTimestamp(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '—';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}
