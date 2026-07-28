import { describe, expect, it } from 'vitest';
import {
  changeResource,
  commitResourceTransaction,
  defineResources,
  initializeResourceBalances,
  planResourceTransaction,
  resourceAtLeast,
} from '../src/engine/index.js';

const resources = defineResources({
  energy: { initial: 10, min: 0, max: 20 },
  coins: { initial: 0, min: 0 },
});

describe('resource balances', () => {
  it('adds defaults for new definitions without losing saved or unknown balances', () => {
    expect(initializeResourceBalances(resources, { energy: 4, future: 9 })).toEqual({
      energy: 4,
      future: 9,
      coins: 0,
    });
  });

  it('rejects non-finite or out-of-bounds restored balances, including unknown keys', () => {
    expect(() => initializeResourceBalances(resources, { energy: Number.NaN })).toThrow(TypeError);
    expect(() => initializeResourceBalances(resources, { energy: 21 })).toThrow(RangeError);
    expect(() => initializeResourceBalances(resources, { future: Number.POSITIVE_INFINITY }))
      .toThrow(TypeError);
  });

  it('treats prototype names as safe own resource ids', () => {
    const definitions = JSON.parse('{"toString":{"initial":1},"constructor":{"initial":2},"__proto__":{"initial":3}}');
    const saved = JSON.parse('{"toString":4,"constructor":5,"__proto__":6,"future":7}');
    const balances = initializeResourceBalances(defineResources(definitions), saved);
    const plan = planResourceTransaction(definitions, balances, {
      id: 'prototype-safe',
      requirements: [resourceAtLeast('constructor', 5)],
      effects: [changeResource('__proto__', 1), changeResource('toString', -1)],
    });
    expect(plan).toMatchObject({ ok: true, balances: {
      toString: 3, constructor: 5, __proto__: 7, future: 7,
    } });
    expect(Object.hasOwn(plan.balances, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(plan.balances)).toBe(Object.prototype);
  });

  it('rejects empty ids and corrupt working balances', () => {
    expect(() => resourceAtLeast('', 1)).toThrow(TypeError);
    expect(() => changeResource(' ', 1)).toThrow(TypeError);
    expect(() => planResourceTransaction(resources, { energy: Number.NaN }, {
      id: 'bad', effects: [],
    })).toThrow(TypeError);
    expect(() => planResourceTransaction(resources, { energy: 1 }, {
      id: '', effects: [],
    })).toThrow(TypeError);
  });

  it('applies multiple resources atomically with authored-order change records', () => {
    const balances = { energy: 10, coins: 2 };
    const plan = planResourceTransaction(resources, balances, {
      id: 'ring_bell',
      requirements: [resourceAtLeast('energy', 3)],
      effects: [changeResource('energy', -3), changeResource('coins', 1)],
    });

    expect(plan).toEqual({
      ok: true,
      balances: { energy: 7, coins: 3 },
      changes: [
        {
          type: 'resource.changed', transactionId: 'ring_bell', effectIndex: 0,
          resourceId: 'energy', previous: 10, delta: -3, current: 7,
        },
        {
          type: 'resource.changed', transactionId: 'ring_bell', effectIndex: 1,
          resourceId: 'coins', previous: 2, delta: 1, current: 3,
        },
      ],
    });
    expect(balances).toEqual({ energy: 10, coins: 2 });
    expect(commitResourceTransaction(balances, plan)).toBe(true);
    expect(balances).toEqual({ energy: 7, coins: 3 });
  });

  it('rejects unmet requirements without applying effects', () => {
    const balances = { energy: 2, coins: 0 };
    const plan = planResourceTransaction(resources, balances, {
      id: 'ring_bell',
      requirements: [resourceAtLeast('energy', 3)],
      effects: [changeResource('energy', -3)],
    });

    expect(plan).toEqual({
      ok: false,
      balances,
      changes: [],
      failure: {
        code: 'resource_requirement_not_met', resourceId: 'energy',
        requirementIndex: 0, required: 3, available: 2,
      },
    });
  });

  it('rejects the whole plan when any effect exceeds a bound', () => {
    const balances = { energy: 19, coins: 2 };
    const plan = planResourceTransaction(resources, balances, {
      id: 'collect_battery',
      effects: [changeResource('coins', 1), changeResource('energy', 2)],
    });

    expect(plan.ok).toBe(false);
    if (plan.ok) throw new Error('expected rejection');
    expect(plan.changes).toEqual([]);
    expect(plan.balances).toBe(balances);
    expect(plan.failure).toEqual({
      code: 'resource_bounds_exceeded', resourceId: 'energy', effectIndex: 1,
      attempted: 21, min: 0, max: 20,
    });
  });

  it('rejects arithmetic overflow instead of committing an infinite balance', () => {
    const unbounded = defineResources({ score: { initial: Number.MAX_VALUE } });
    const balances = { score: Number.MAX_VALUE };
    const plan = planResourceTransaction(unbounded, balances, {
      id: 'overflow', effects: [changeResource('score', Number.MAX_VALUE)],
    });

    expect(plan.ok).toBe(false);
    expect(plan.balances).toBe(balances);
    expect(plan.changes).toEqual([]);
    expect(plan).toMatchObject({
      failure: {
        code: 'resource_arithmetic_overflow', resourceId: 'score', effectIndex: 0,
      },
    });
    expect(JSON.stringify(plan)).not.toContain('null');
  });

  it('returns a structured failure for unknown resources', () => {
    const plan = planResourceTransaction(resources, { energy: 10, coins: 0 }, {
      id: 'cast',
      effects: [changeResource('mana', -1)],
    });

    expect(plan.ok).toBe(false);
    if (plan.ok) throw new Error('expected rejection');
    expect(plan.failure).toEqual({
      code: 'resource_not_defined', resourceId: 'mana', phase: 'effect', index: 0,
    });
  });

  it.each([
    { amount: -1, error: RangeError },
    { amount: Number.NaN, error: TypeError },
    { amount: Number.POSITIVE_INFINITY, error: TypeError },
    { amount: Number.NEGATIVE_INFINITY, error: TypeError },
  ])('rejects invalid minimum $amount at factory and plan boundaries', ({ amount, error }) => {
    expect(() => resourceAtLeast('energy', amount)).toThrow(error);
    expect(() => planResourceTransaction(resources, { energy: 10 }, {
      id: 'raw_requirement',
      requirements: [{ type: 'resource.minimum', resourceId: 'energy', amount }],
      effects: [],
    })).toThrow(error);
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])('rejects invalid delta %s at factory and plan boundaries', (delta) => {
    expect(() => changeResource('energy', delta)).toThrow(TypeError);
    expect(() => planResourceTransaction(resources, { energy: 10 }, {
      id: 'raw_delta',
      effects: [{ type: 'resource.delta', resourceId: 'energy', delta }],
    })).toThrow(TypeError);
  });
});
