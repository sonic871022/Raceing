import { describe, expect, it } from 'vitest';
import {
  arbitrateResourceClaims,
  resolveArrival,
  type ArrivalRule,
} from '../src/engine/index.js';

describe('arrival rules', () => {
  it('applies eligible rules in deterministic order', () => {
    const state = { shape: 1 };
    const events: string[] = [];
    const rules: Array<ArrivalRule<typeof state, { tile: string }, string>> = [
      {
        id: 'late', priority: 2,
        apply: (_state, _arrival, output) => output.push('late'),
      },
      {
        id: 'shape', priority: 1,
        applies: (_state, arrival) => arrival.tile === 'transform',
        apply: (world, _arrival, output) => {
          world.shape += 1;
          output.push('shape');
        },
      },
      {
        id: 'skipped', priority: 0,
        applies: () => false,
        apply: () => undefined,
      },
    ];

    expect(resolveArrival(state, { tile: 'transform' }, rules, events))
      .toEqual(['shape', 'late']);
    expect(state.shape).toBe(2);
    expect(events).toEqual(['shape', 'late']);
  });
});

describe('resource claim arbitration', () => {
  it('fails every claim sharing any resource without choosing a winner', () => {
    const result = arbitrateResourceClaims([
      { id: 'pickup-a', resources: ['2,1'], claim: 'a' },
      { id: 'pickup-b', resources: ['2,1'], claim: 'b' },
      { id: 'beam', resources: ['4,1', '5,1'], claim: 'beam' },
      { id: 'safe', resources: ['8,1'], claim: 'safe' },
      { id: 'flight', resources: ['5,1'], claim: 'flight' },
    ]);

    expect(result.accepted.map(({ id }) => id)).toEqual(['safe']);
    expect(result.contested.map(({ id }) => id))
      .toEqual(['pickup-a', 'pickup-b', 'beam', 'flight']);
    expect([...result.conflicts]).toEqual([
      ['2,1', ['pickup-a', 'pickup-b']],
      ['5,1', ['beam', 'flight']],
    ]);
  });

  it('rejects duplicate action identities instead of silently merging policy', () => {
    expect(() => arbitrateResourceClaims([
      { id: 'same', resources: ['a'], claim: 1 },
      { id: 'same', resources: ['b'], claim: 2 },
    ])).toThrowError('duplicate resource claim id: same');
  });
});
