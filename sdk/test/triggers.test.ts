import { describe, expect, it } from 'vitest';
import {
  resolveLatchedTriggers,
  type LatchedTrigger,
} from '../src/engine/index.js';

interface TriggerState {
  value: number;
  latched: string[];
  applied: string[];
  evaluated: string[];
}

interface Condition {
  minimum: number;
}

interface Effect {
  add: number;
}

const triggers: Array<LatchedTrigger<Condition, Effect>> = [
  { id: 'first', condition: { minimum: 0 }, effects: [{ add: 1 }] },
  { id: 'second', condition: { minimum: 1 }, effects: [{ add: 2 }] },
  { id: 'false', condition: { minimum: 99 }, effects: [{ add: 100 }] },
];

function resolve(state: TriggerState): string[] {
  return resolveLatchedTriggers(state, triggers, {
    isLatched: (current, id) => current.latched.includes(id),
    conditionMet: (current, condition, trigger) => {
      current.evaluated.push(trigger.id);
      return current.value >= condition.minimum;
    },
    latch: (current, id) => current.latched.push(id),
    applyEffect: (current, effect, trigger) => {
      expect(current.latched).toContain(trigger.id);
      current.value += effect.add;
      current.applied.push(trigger.id);
    },
  });
}

describe('latched triggers', () => {
  it('fires in authored order and exposes earlier effects to later conditions', () => {
    const state: TriggerState = {
      value: 0, latched: [], applied: [], evaluated: [],
    };

    expect(resolve(state)).toEqual(['first', 'second']);
    expect(state.value).toBe(3);
    expect(state.latched).toEqual(['first', 'second']);
    expect(state.applied).toEqual(['first', 'second']);
    expect(state.evaluated).toEqual(['first', 'second', 'false']);
  });

  it('skips pre-latched ids without evaluating or applying them', () => {
    const state: TriggerState = {
      value: 0, latched: ['first'], applied: [], evaluated: [],
    };

    expect(resolve(state)).toEqual([]);
    expect(state.value).toBe(0);
    expect(state.applied).toEqual([]);
    expect(state.evaluated).toEqual(['second', 'false']);
  });

  it('leaves a false trigger armed', () => {
    const state: TriggerState = {
      value: -1, latched: [], applied: [], evaluated: [],
    };

    expect(resolve(state)).toEqual([]);
    expect(state.latched).toEqual([]);
    expect(state.applied).toEqual([]);
  });
});
