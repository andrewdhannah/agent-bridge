/**
 * Agent Bridge — Background Service Worker
 *
 * Listens for messages from popup.js and POSTs captured prompts
to the local agent-bridge HTTP server at http://127.0.0.1:3457.
 */

const BRIDGE_URL = 'http://127.0.0.1:3457';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'submit_prompt') {
    sendResponse({ ok: false, error: 'Unknown message type' });
    return false;
  }

  const payload = {
    source: message.source ?? 'unknown',
    threadTitle: message.threadTitle ?? 'Untitled',
    prompt: message.prompt ?? '',
  };

  fetch(`${BRIDGE_URL}/incoming`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
    .then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        sendResponse({ ok: false, error: data.error || `HTTP ${res.status}` });
      } else {
        sendResponse({ ok: true, packetId: data.packetId, state: data.state });
      }
    })
    .catch((err) => {
      sendResponse({ ok: false, error: err.message });
    });

  // Return true to indicate we will call sendResponse asynchronously
  return true;
});

// Optional: health-check on startup to confirm bridge is reachable
chrome.runtime.onStartup.addListener(() => {
  fetch(`${BRIDGE_URL}/health`)
    .then((res) => res.json())
    .then((data) => console.log('[agent-bridge:ext] Bridge health:', data.status))
    .catch((err) => console.warn('[agent-bridge:ext] Bridge unreachable:', err.message));
});
