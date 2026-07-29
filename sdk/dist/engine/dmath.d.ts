/**
 * Math operations classified for deterministic reducer state paths.
 *
 * The lists are documentation and lint inputs. Runtime determinism still
 * depends on using `Dmath` for implementation-approximated functions.
 */
export declare const STATE_MATH: Readonly<{
    constants: readonly ["Math.E", "Math.LN2", "Math.LN10", "Math.LOG2E", "Math.LOG10E", "Math.PI", "Math.SQRT1_2", "Math.SQRT2"];
    exact: readonly ["+", "-", "*", "/", "%", "Math.sqrt", "Math.abs", "Math.floor", "Math.ceil", "Math.round", "Math.trunc", "Math.sign", "Math.min", "Math.max", "Math.fround", "Math.imul", "Math.clz32"];
    forbidden: readonly ["Math.sin", "Math.cos", "Math.tan", "Math.asin", "Math.acos", "Math.atan", "Math.atan2", "Math.exp", "Math.expm1", "Math.log", "Math.log1p", "Math.log2", "Math.log10", "Math.pow", "Math.hypot", "Math.cbrt", "Math.sinh", "Math.cosh", "Math.tanh", "Math.asinh", "Math.acosh", "Math.atanh", "Math.random"];
}>;
export declare const DMATH_ALGORITHM: "dmath-1";
export interface DmathBackend {
    readonly id: 'js' | 'wasm';
    sin(x: number): number;
    cos(x: number): number;
    atan2(y: number, x: number): number;
}
export interface Dmath {
    readonly algorithm: typeof DMATH_ALGORITHM;
    readonly backend: 'js' | 'wasm';
    sin(x: number): number;
    cos(x: number): number;
    atan2(y: number, x: number): number;
    clamp(x: number, lo: number, hi: number): number;
    roundTo(x: number, decimals: number): number;
}
/** Construct one immutable, session-scoped deterministic math context. */
export declare function createDmath(options?: {
    algorithm?: typeof DMATH_ALGORITHM;
    backend?: DmathBackend;
}): Dmath;
/** Frozen constants used by tests and external vector generators. */
export declare const DMATH_CONSTANTS: Readonly<{
    PI: 3.141592653589793;
    PI_OVER_2: 1.5707963267948966;
    PI_OVER_4: 0.7853981633974483;
    TWO_PI: 6.283185307179586;
    MAX_TRIG_INPUT: 1073741824;
}>;
