import type { Participation } from './contracts.js';
export type ResponsePassReason = 'pass' | 'timeout' | 'wait';
export interface ResponseStackEntry<TResponse> {
    sequence: number;
    seat: string;
    response: TResponse;
}
export interface ResponsePass {
    sequence: number;
    seat: string;
    reason: ResponsePassReason;
}
export interface ResponseWindow<TResponse> {
    seats: readonly string[];
    priority: number;
    consecutivePasses: number;
    stack: readonly ResponseStackEntry<TResponse>[];
    passes: readonly ResponsePass[];
    nextSequence: number;
    closed: boolean;
}
/** Open a response window with deterministic authored seat order. */
export declare function openResponseWindow<TResponse>(seats: readonly string[], first?: number, pending?: readonly {
    seat: string;
    response: TResponse;
}[]): ResponseWindow<TResponse>;
export declare function responsePrioritySeat<TResponse>(window: ResponseWindow<TResponse>): string;
/** A response enters the stack and resets the consecutive-pass count. */
export declare function submitResponse<TResponse>(window: ResponseWindow<TResponse>, seat: string, response: TResponse): ResponseWindow<TResponse>;
/**
 * Pass priority. The window closes after every seat passes consecutively;
 * timeouts are ordinary deterministic passes with an explicit reason.
 */
export declare function passResponsePriority<TResponse>(window: ResponseWindow<TResponse>, seat: string, reason?: ResponsePassReason): ResponseWindow<TResponse>;
export declare function timeoutResponsePriority<TResponse>(window: ResponseWindow<TResponse>): ResponseWindow<TResponse>;
/** Return the stack in LIFO resolution order after the window closes. */
export declare function unwindResponseWindow<TResponse>(window: ResponseWindow<TResponse>): readonly ResponseStackEntry<TResponse>[];
/** Participation descriptor for the ordinary collection tick backing a window. */
export declare function responseWindowParticipation<TResponse>(window: ResponseWindow<TResponse>): Participation;
