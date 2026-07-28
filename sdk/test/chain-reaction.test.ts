import { describe, expect, it } from 'vitest';
import { resolveChainReaction } from '../src/engine/index.js';

describe('chain reaction mechanism', () => {
  it('resolves breadth-first waves and reacts to each identity once', () => {
    const graph: Record<string, string[]> = {
      a: ['b', 'c'],
      b: ['d'],
      c: ['d'],
      d: [],
    };
    const order: string[] = [];
    const result = resolveChainReaction({ energy: 0 }, ['a'], {
      key: (node) => node,
      maxReactions: 4,
      react: (state, node, context) => {
        order.push(`${context.wave}:${node}`);
        state.energy += 1;
        return graph[node]!;
      },
    });

    expect(order).toEqual(['0:a', '1:b', '1:c', '2:d']);
    expect(result.state.energy).toBe(4);
    expect(result.steps).toBe(4);
    expect(result.waves).toBe(3);
  });

  it('preserves seed and discovery order within each wave', () => {
    const order: string[] = [];
    resolveChainReaction({}, ['right', 'left'], {
      key: (node) => node,
      maxReactions: 4,
      react: (_state, node) => {
        order.push(node);
        return node === 'right' ? ['right-child'] : ['left-child'];
      },
    });

    expect(order).toEqual(['right', 'left', 'right-child', 'left-child']);
  });
});
