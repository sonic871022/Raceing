import { describe, expect, it } from 'vitest';
import {
  evaluateBehaviorTree,
  type BehaviorTreeAdapter,
} from '../src/engine/index.js';

type Node =
  | { select: readonly Node[] }
  | { when: string; then: Node; otherwise?: Node }
  | { action: string };

interface Context {
  conditions: ReadonlySet<string>;
  visited: string[];
  unavailable: ReadonlySet<string>;
}

const adapter: BehaviorTreeAdapter<Context, Node, string, string> = {
  inspect: (node) => {
    if ('select' in node) return { kind: 'selector', children: node.select };
    if ('when' in node) {
      return {
        kind: 'condition',
        condition: node.when,
        then: node.then,
        else: node.otherwise,
      };
    }
    return { kind: 'leaf' };
  },
  test: (context, condition) => context.conditions.has(condition),
  evaluateLeaf: (context, node) => {
    if (!('action' in node)) throw new Error('expected an action leaf');
    context.visited.push(node.action);
    return context.unavailable.has(node.action) ? null : node.action;
  },
};

function context(
  conditions: readonly string[] = [],
  unavailable: readonly string[] = [],
): Context {
  return {
    conditions: new Set(conditions),
    unavailable: new Set(unavailable),
    visited: [],
  };
}

describe('behavior tree evaluation', () => {
  it('returns the first non-null selector result', () => {
    const state = context([], ['blocked']);
    const result = evaluateBehaviorTree(state, {
      select: [
        { action: 'blocked' },
        { action: 'chosen' },
        { action: 'not-visited' },
      ],
    }, adapter);

    expect(result).toBe('chosen');
    expect(state.visited).toEqual(['blocked', 'chosen']);
  });

  it('evaluates only the branch selected by a condition', () => {
    const trueState = context(['ready']);
    const falseState = context();
    const tree: Node = {
      when: 'ready',
      then: { action: 'advance' },
      otherwise: { action: 'wait' },
    };

    expect(evaluateBehaviorTree(trueState, tree, adapter)).toBe('advance');
    expect(trueState.visited).toEqual(['advance']);
    expect(evaluateBehaviorTree(falseState, tree, adapter)).toBe('wait');
    expect(falseState.visited).toEqual(['wait']);
  });

  it('returns null for a false condition without an else branch', () => {
    const state = context();
    const result = evaluateBehaviorTree(state, {
      when: 'ready',
      then: { action: 'advance' },
    }, adapter);

    expect(result).toBeNull();
    expect(state.visited).toEqual([]);
  });

  it('allows nested selectors and conditions to fall through', () => {
    const state = context();
    const result = evaluateBehaviorTree(state, {
      select: [
        { when: 'missing', then: { action: 'skipped' } },
        { action: 'fallback' },
      ],
    }, adapter);

    expect(result).toBe('fallback');
    expect(state.visited).toEqual(['fallback']);
  });
});
