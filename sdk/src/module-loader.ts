import { pathToFileURL } from 'node:url';

const nativeDynamicImport = new Function(
  'specifier',
  'return import(specifier);',
) as (specifier: string) => Promise<unknown>;

/**
 * Load a caller-supplied ESM module from an absolute filesystem path.
 *
 * Vitest/Vite rewrites ordinary dynamic imports inside source modules, which can
 * break temporary or out-of-root files used by CLI tests. Using the native
 * runtime importer preserves ordinary Node.js semantics for external modules.
 */
export async function importExternalModule<T>(absolutePath: string): Promise<T> {
  return await nativeDynamicImport(pathToFileURL(absolutePath).href) as T;
}
