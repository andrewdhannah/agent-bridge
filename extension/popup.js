/**
 * Agent Bridge — Popup Script
 *
 * Captures the prompt from the textarea, sends it to the background
 * service worker, and displays the result status.
 */

document.addEventListener('DOMContentLoaded', () => {
  const promptEl = document.getElementById('prompt');
  const submitBtn = document.getElementById('submit');
  const statusEl = document.getElementById('status');

  if (!promptEl || !submitBtn || !statusEl) return;

  submitBtn.addEventListener('click', async () => {
    const prompt = promptEl.value.trim();
    if (!prompt) {
      showStatus('Please enter a prompt.', 'error');
      return;
    }

    submitBtn.disabled = true;
    showStatus('Sending...', '');

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'submit_prompt',
        source: 'chatgpt',
        threadTitle: document.title || 'Untitled',
        prompt,
      });

      if (response.ok) {
        showStatus(`Queued! Packet ID: ${response.packetId}`, 'success');
        promptEl.value = '';
      } else {
        showStatus(`Error: ${response.error}`, 'error');
      }
    } catch (err) {
      showStatus(`Error: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });

  function showStatus(text, cls) {
    statusEl.textContent = text;
    statusEl.className = cls;
  }
});
