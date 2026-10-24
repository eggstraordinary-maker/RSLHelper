import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRecognitionConfig } from './recognitionConfig';

describe('recognition transport configuration', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_RECOGNITION_URL', '');
    vi.stubEnv('VITE_RECOGNITION_TRANSPORT', 'websocket');
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it.each([
    'ws://localhost:8081/recognize',
    'wss://recognition.example.org/session',
  ])('accepts an explicitly configured websocket endpoint %s', endpoint => {
    vi.stubEnv('VITE_RECOGNITION_URL', endpoint);
    expect(getRecognitionConfig()).toEqual({ endpoint, transport: 'websocket', valid: true });
  });

  it('trims endpoint whitespace and defaults an absent transport to websocket', () => {
    vi.stubEnv('VITE_RECOGNITION_URL', '  wss://recognition.example.org/session  ');
    vi.stubEnv('VITE_RECOGNITION_TRANSPORT', undefined);
    expect(getRecognitionConfig()).toEqual({
      endpoint: 'wss://recognition.example.org/session', transport: 'websocket', valid: true,
    });
  });

  it.each(['', '   ', '/recognize', 'not a URL', 'wss://'])('keeps recognition unavailable for an absent or malformed endpoint %j', endpoint => {
    vi.stubEnv('VITE_RECOGNITION_URL', endpoint);
    expect(getRecognitionConfig().valid).toBe(false);
  });

  it.each([
    'http://recognition.example.org/session',
    'https://recognition.example.org/session',
    'javascript:alert(1)',
    'file:///recognize',
  ])('rejects the unsupported endpoint scheme %s', endpoint => {
    vi.stubEnv('VITE_RECOGNITION_URL', endpoint);
    expect(getRecognitionConfig().valid).toBe(false);
  });

  it.each([
    'wss://example-user@recognition.example.org/session',
    'ws://example-user:example-password@localhost:8081/recognize',
    'wss://:example-password@recognition.example.org/session',
  ])('rejects embedded credentials in %s', endpoint => {
    vi.stubEnv('VITE_RECOGNITION_URL', endpoint);
    expect(getRecognitionConfig().valid).toBe(false);
  });

  it.each(['http', 'grpc', 'WebSocket'])('rejects the unsupported transport %s even with a websocket URL', transport => {
    vi.stubEnv('VITE_RECOGNITION_URL', 'wss://recognition.example.org/session');
    vi.stubEnv('VITE_RECOGNITION_TRANSPORT', transport);
    expect(getRecognitionConfig().valid).toBe(false);
  });
});
