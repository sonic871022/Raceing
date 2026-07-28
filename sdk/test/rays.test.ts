import { describe, expect, it } from 'vitest';
import {
  bresenhamLine,
  traverseGridRay,
  type Cell,
} from '../src/engine/index.js';

const CONTINUE = { action: 'continue' } as const;

describe('grid ray traversal', () => {
  it('stops at the first terminal cell with its ordered step', () => {
    const visited: Cell[] = [];
    const result = traverseGridRay(
      bresenhamLine([0, 0], [4, 0]),
      (cell, step) => {
        visited.push(cell);
        if (cell[0] === 2 || cell[0] === 4) {
          return { action: 'stop', value: { kind: 'occupied', step } };
        }
        return CONTINUE;
      },
    );

    expect(result).toEqual({
      outcome: 'stopped',
      cell: [2, 0],
      step: 2,
      value: { kind: 'occupied', step: 2 },
    });
    expect(visited).toEqual([[1, 0], [2, 0]]);
  });

  it('reports exhaustion after visiting every cell in a finite path', () => {
    const steps: number[] = [];
    const result = traverseGridRay(
      bresenhamLine([0, 0], [3, 0]),
      (_cell, step) => {
        steps.push(step);
        return CONTINUE;
      },
    );

    expect(result).toEqual({ outcome: 'exhausted', steps: 3 });
    expect(steps).toEqual([1, 2, 3]);
  });

  it('stops an open-ended cardinal generator without materializing it', () => {
    let produced = 0;
    function* eastFrom(origin: Cell): Generator<Cell> {
      for (let x = origin[0] + 1; ; x += 1) {
        produced += 1;
        yield [x, origin[1]];
      }
    }

    const result = traverseGridRay(eastFrom([5, 7]), (cell, step) => (
      step === 4
        ? { action: 'stop', value: 'edge' }
        : CONTINUE
    ));

    expect(result).toEqual({
      outcome: 'stopped', cell: [9, 7], step: 4, value: 'edge',
    });
    expect(produced).toBe(4);
  });
});
