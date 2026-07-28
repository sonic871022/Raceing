import type { BoardLayout } from './layouts.js';

export interface TokenRef<TCell = unknown> {
  id: string;
  /** Authored location; its layout key must equal the containing map key. */
  cell: TCell;
  [key: string]: unknown;
}

export interface PatternSpec<TCell, TToken extends TokenRef<TCell> = TokenRef<TCell>> {
  shape:
    | { kind: 'run'; minLength: number }
    | { kind: 'motif'; offsets: readonly TCell[] };
  matches(a: TToken, b: TToken): boolean;
  /**
   * Place a relative motif offset at an origin. Two-number tuple cells have a
   * built-in additive default; other coordinate types must provide this.
   */
  translate?: (origin: TCell, offset: TCell) => TCell;
}

export interface PatternMatch<TCell, TToken extends TokenRef<TCell> = TokenRef<TCell>> {
  cells: readonly TCell[];
  tokens: readonly TToken[];
}

function additiveCell<TCell>(origin: TCell, offset: TCell): TCell {
  if (Array.isArray(origin) && origin.length === 2
    && Array.isArray(offset) && offset.length === 2
    && origin.every((value) => typeof value === 'number')
    && offset.every((value) => typeof value === 'number')) {
    return [
      (origin[0] as number) + (offset[0] as number),
      (origin[1] as number) + (offset[1] as number),
    ] as TCell;
  }
  throw new TypeError('non-lattice motifs require PatternSpec.translate');
}

function sameCell<TCell>(layout: BoardLayout<TCell>, a: TCell, b: TCell): boolean {
  return layout.key(a) === layout.key(b);
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function pathIsContiguous<TCell>(layout: BoardLayout<TCell>, cells: readonly TCell[]): boolean {
  for (let index = 1; index < cells.length; index++) {
    const previous = cells[index - 1]!;
    const currentKey = layout.key(cells[index]!);
    if (!layout.neighbors(previous).some((neighbor) => layout.key(neighbor) === currentKey)) {
      return false;
    }
  }
  return true;
}

function matchKey<TCell>(layout: BoardLayout<TCell>, cells: readonly TCell[]): string {
  return cells.map((cell) => layout.key(cell)).sort().join('\u0000');
}

/**
 * Find deterministic runs or relative motifs. Overlapping maximal matches are
 * reported independently.
 */
export function findPatterns<TCell, TToken extends TokenRef<TCell> = TokenRef<TCell>>(
  layout: BoardLayout<TCell>,
  occupied: ReadonlyMap<string, TToken>,
  spec: PatternSpec<TCell, TToken>,
): readonly PatternMatch<TCell, TToken>[] {
  if (!spec || typeof spec.matches !== 'function') {
    throw new TypeError('pattern spec requires a matches function');
  }
  const candidateCells: TCell[] = [];
  for (const [key, token] of occupied) {
    if (!token || typeof token !== 'object' || !('cell' in token)) {
      throw new TypeError('pattern tokens must carry their authored cell');
    }
    if (!layout.contains(token.cell) || layout.key(token.cell) !== key) {
      throw new TypeError(`pattern token cell does not match occupied key: ${key}`);
    }
    candidateCells.push(token.cell);
  }
  candidateCells.sort((a, b) => compareStrings(layout.key(a), layout.key(b)));

  if (spec.shape.kind === 'motif') {
    if (!Array.isArray(spec.shape.offsets) || spec.shape.offsets.length === 0) {
      throw new RangeError('motif offsets must not be empty');
    }
    const translate = spec.translate ?? additiveCell;
    const seen = new Set<string>();
    const results: Array<PatternMatch<TCell, TToken>> = [];
    for (const origin of candidateCells) {
      const cells = spec.shape.offsets.map((offset) => translate(origin, offset));
      if (cells.some((cell) => !layout.contains(cell))) continue;
      const tokens = cells.map((cell) => occupied.get(layout.key(cell)));
      if (tokens.some((token) => token === undefined)) continue;
      const base = tokens[0]!;
      if (!tokens.every((token) => spec.matches(base, token!))) continue;
      const key = matchKey(layout, cells);
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ cells, tokens: tokens as TToken[] });
    }
    return results.sort((a, b) => compareStrings(
      matchKey(layout, a.cells),
      matchKey(layout, b.cells),
    ));
  }

  if (!Number.isSafeInteger(spec.shape.minLength) || spec.shape.minLength < 1) {
    throw new RangeError('run minimum length must be a positive safe integer');
  }
  if (spec.shape.minLength === 1) {
    return candidateCells.map((cell) => ({
      cells: [cell],
      tokens: [occupied.get(layout.key(cell))!],
    }));
  }

  const candidates: Array<PatternMatch<TCell, TToken>> = [];
  const seen = new Set<string>();
  for (let startIndex = 0; startIndex < candidateCells.length; startIndex++) {
    const start = candidateCells[startIndex]!;
    const startToken = occupied.get(layout.key(start))!;
    for (let endIndex = startIndex + 1; endIndex < candidateCells.length; endIndex++) {
      const end = candidateCells[endIndex]!;
      const line = [start, ...layout.line(start, end)];
      if (line.length < spec.shape.minLength
        || !sameCell(layout, line.at(-1)!, end)
        || !pathIsContiguous(layout, line)) continue;
      const tokens = line.map((cell) => occupied.get(layout.key(cell)));
      if (tokens.some((token) => token === undefined)
        || !tokens.every((token) => spec.matches(startToken, token!))) continue;
      const key = matchKey(layout, line);
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ cells: line, tokens: tokens as TToken[] });
    }
  }

  const maximal = candidates.filter((candidate, index) => {
    const keys = new Set(candidate.cells.map((cell) => layout.key(cell)));
    return !candidates.some((other, otherIndex) => (
      index !== otherIndex
      && other.cells.length > candidate.cells.length
      && candidate.tokens.every((token) => spec.matches(other.tokens[0]!, token))
      && [...keys].every((key) => other.cells.some((cell) => layout.key(cell) === key))
    ));
  });
  return maximal.sort((a, b) => compareStrings(
    matchKey(layout, a.cells),
    matchKey(layout, b.cells),
  ));
}
