/* tslint:disable */
/* eslint-disable */

/**
 * Tiny self-test export so the JS side can confirm the module loaded + runs.
 */
export function brain_core_version(): string;

/**
 * Does a proposed chain TYPE-CONNECT? (port of decide.ts chainConnects). Each
 * step's produced family must feed the next's accepted family; unknown/empty
 * types get the benefit of the doubt (only a KNOWN mismatch fails).
 */
export function chain_connects(tools_json: string, cands_json: string): boolean;

/**
 * The guardrail (port of decide.ts guardrailTool): when retrieval is confident,
 * single-step, and the top tool POSITIVELY accepts the input family, return its
 * id to force; else "" (let the model decide).
 */
export function guardrail_tool(message: string, cands_json: string, input_fam: string, conf: string): string;

/**
 * Map a MIME type or file extension to a coarse media family. 1:1 port of
 * capability-graph.ts `mimeFamily` (returns "" for unknown, like null).
 */
export function mime_family(raw: string): string;

/**
 * Short format word for a MIME / extension (port of capability-graph.ts mimeFormat).
 */
export function mime_format(raw: string): string;

/**
 * A user word/format → media family, "" if unknown (port of wordFamily).
 */
export function word_family(word: string): string;

/**
 * A concrete format word, or "" if it's a bare family name (port of wordToFormat).
 */
export function word_to_format(word: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly brain_core_version: () => [number, number];
    readonly chain_connects: (a: number, b: number, c: number, d: number) => number;
    readonly guardrail_tool: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number];
    readonly mime_family: (a: number, b: number) => [number, number];
    readonly mime_format: (a: number, b: number) => [number, number];
    readonly word_family: (a: number, b: number) => [number, number];
    readonly word_to_format: (a: number, b: number) => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
