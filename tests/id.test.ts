import { describe, it, expect } from 'vitest';
import { genId } from '../src/utils/id';

describe('ID Generator', () => {
  it('should generate unique IDs', () => {
    const id1 = genId();
    const id2 = genId();
    expect(id1).not.toBe(id2);
    expect(id1).toBeDefined();
    expect(id2).toBeDefined();
  });

  it('should generate valid UUID format', () => {
    const id = genId();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(uuidRegex.test(id)).toBe(true);
  });

  it('should generate 100 unique IDs', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(genId());
    }
    expect(ids.size).toBe(100);
  });
});
