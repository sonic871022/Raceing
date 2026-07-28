import { describe, expect, it } from 'vitest';
import { resolveGateTransition } from '../src/engine/index.js';

describe('gate transitions', () => {
  it('opens a latch once and never closes it when activation ends', () => {
    expect(resolveGateTransition({
      mode: 'latch', state: 'closed', active: true,
    })).toEqual({ state: 'open', changed: true, transition: 'opened' });

    expect(resolveGateTransition({
      mode: 'latch', state: 'open', active: false,
    })).toEqual({ state: 'open', changed: false, transition: null });
  });

  it('tracks automatic activation without closing on an occupant', () => {
    expect(resolveGateTransition({
      mode: 'automatic', state: 'closed', active: true,
    })).toEqual({ state: 'open', changed: true, transition: 'opened' });

    expect(resolveGateTransition({
      mode: 'automatic', state: 'open', active: false, occupied: true,
    })).toEqual({ state: 'open', changed: false, transition: null });

    expect(resolveGateTransition({
      mode: 'automatic', state: 'open', active: false, occupied: false,
    })).toEqual({ state: 'closed', changed: true, transition: 'closed' });
  });

  it('does not report a transition when the state already matches activation', () => {
    expect(resolveGateTransition({
      mode: 'automatic', state: 'closed', active: false,
    })).toEqual({ state: 'closed', changed: false, transition: null });

    expect(resolveGateTransition({
      mode: 'automatic', state: 'open', active: true,
    })).toEqual({ state: 'open', changed: false, transition: null });
  });
});
