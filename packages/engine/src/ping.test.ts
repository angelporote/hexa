import { describe, expect, it } from 'vitest';
import { ping } from './ping.js';

describe('ping', () => {
  it('responde pong', () => {
    expect(ping()).toBe('pong');
  });
});
