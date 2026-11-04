/** Future transport settings. No frame transport is enabled until an adapter exists. */
export function getRecognitionConfig() {
  const endpoint = (import.meta.env.VITE_RECOGNITION_URL || '').trim();
  const transport = import.meta.env.VITE_RECOGNITION_TRANSPORT || 'websocket';
  let valid = false;
  try {
    const url = new URL(endpoint);
    valid = transport === 'websocket' && ['ws:', 'wss:'].includes(url.protocol)
      && !url.username && !url.password;
  } catch { /* An absent or invalid endpoint keeps recognition unavailable. */ }
  return { endpoint, transport, valid };
}
