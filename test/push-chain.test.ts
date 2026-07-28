import { describe, expect, it } from 'vitest';
import {
  commitPushChain,
  planPushChain,
  type Cell,
} from '../src/engine/index.js';

const key = ([x, y]: Cell): string => `${x},${y}`;

describe('push-chain mechanism', () => {
  it('plans a complete chain through an injected destination policy', () => {
    const occupied = new Set(['1,1', '2,1']);
    const steps = planPushChain([1, 1], [1, 0], {
      occupied: (cell) => occupied.has(key(cell)),
      destination: (from, direction) => ({
        to: [from[0] + direction[0], from[1] + direction[1]],
      }),
      blocked: ({ to }) => to[0] >= 4,
      maxItems: 4,
    });

    expect(steps).toEqual([
      { from: [1, 1], to: [2, 1] },
      { from: [2, 1], to: [3, 1] },
    ]);
  });

  it('supports mechanic-specific jumps and stalls the whole chain', () => {
    const occupied = new Set(['1,1', '3,1']);
    const plan = (blockedX: number) => planPushChain([1, 1], [1, 0], {
      occupied: (cell) => occupied.has(key(cell)),
      destination: (from) => from[0] === 1
        ? { to: [3, 1] as Cell, metadata: 'squeeze' }
        : { to: [4, 1] as Cell },
      blocked: ({ to }) => to[0] === blockedX,
      maxItems: 4,
    });

    expect(plan(9)).toEqual([
      { from: [1, 1], to: [3, 1], metadata: 'squeeze' },
      { from: [3, 1], to: [4, 1] },
    ]);
    expect(plan(4)).toBeNull();
  });

  it('rejects a chain as soon as it exceeds maxItems', () => {
    const occupied = new Set(['1,1', '2,1']);
    expect(planPushChain([1, 1], [1, 0], {
      occupied: (cell) => occupied.has(key(cell)),
      destination: ([x, y]) => ({ to: [x + 1, y] }),
      blocked: () => false,
      maxItems: 1,
    })).toBeNull();
  });

  it('commits state farthest-first and arrivals nearest-first', () => {
    const events: string[] = [];
    const steps = [
      { from: [1, 1] as Cell, to: [2, 1] as Cell },
      { from: [2, 1] as Cell, to: [3, 1] as Cell },
    ];
    commitPushChain(steps, {
      move: ({ from, to }) => events.push(`move:${key(from)}>${key(to)}`),
      arrive: ({ to }) => events.push(`arrive:${key(to)}`),
    });

    expect(events).toEqual([
      'move:2,1>3,1',
      'move:1,1>2,1',
      'arrive:2,1',
      'arrive:3,1',
    ]);
  });
});
