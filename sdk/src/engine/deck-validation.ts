export interface DeckEntry {
  /** Stable card/unit/loadout definition id. */
  id: string;
  copies: number;
  tags?: readonly string[];
  factions?: readonly string[];
}

export type DeckConstraint =
  | {
    id: string;
    kind: 'totalSize';
    min?: number;
    max?: number;
  }
  | {
    id: string;
    kind: 'copiesLimit';
    max: number;
    /** When present, the limit applies only to entries carrying this tag. */
    tag?: string;
  }
  | {
    id: string;
    kind: 'tagCount';
    tag: string;
    min?: number;
    max?: number;
  }
  | {
    id: string;
    kind: 'factions';
    allowed?: readonly string[];
    maxDistinct?: number;
  };

export type DeckViolationCode =
  | 'duplicate_entry'
  | 'total_size_below_min'
  | 'total_size_above_max'
  | 'copies_limit_exceeded'
  | 'tag_count_below_min'
  | 'tag_count_above_max'
  | 'faction_not_allowed'
  | 'too_many_factions';

export interface DeckViolation {
  constraintId: string;
  constraintIndex: number;
  code: DeckViolationCode;
  entryId?: string;
  actual: number | string;
  expected: number | string | readonly string[];
}

export interface DeckValidationResult {
  valid: boolean;
  totalSize: number;
  violations: readonly DeckViolation[];
}

function assertBound(value: number | undefined, label: string): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
    throw new RangeError(`${label} must be a non-negative safe integer`);
  }
}

function hasTag(entry: DeckEntry, tag: string): boolean {
  return entry.tags?.includes(tag) ?? false;
}

/**
 * Validate card decks, squads, or loadouts through the same declarative
 * size/copies/tag/faction constraint schema.
 */
export function validateDeck(
  entries: readonly DeckEntry[],
  constraints: readonly DeckConstraint[],
): DeckValidationResult {
  if (!Array.isArray(entries) || !Array.isArray(constraints)) {
    throw new TypeError('deck entries and constraints must be arrays');
  }
  const ids = new Set<string>();
  const duplicateIds = new Set<string>();
  let totalSize = 0;
  for (const entry of entries) {
    if (!entry || typeof entry.id !== 'string' || entry.id.length === 0) {
      throw new TypeError('deck entry ids must be non-empty strings');
    }
    if (!Number.isSafeInteger(entry.copies) || entry.copies < 0) {
      throw new RangeError(`deck entry ${entry.id} copies must be non-negative`);
    }
    if (ids.has(entry.id)) duplicateIds.add(entry.id);
    ids.add(entry.id);
    for (const [label, values] of [['tags', entry.tags], ['factions', entry.factions]] as const) {
      if (values && (!Array.isArray(values)
        || values.some((value) => typeof value !== 'string' || value.length === 0)
        || new Set(values).size !== values.length)) {
        throw new TypeError(`deck entry ${entry.id} ${label} must be unique non-empty strings`);
      }
    }
    totalSize += entry.copies;
    if (!Number.isSafeInteger(totalSize)) throw new RangeError('deck total size exceeds safe integer range');
  }

  const violations: DeckViolation[] = [...duplicateIds].sort().map((entryId) => ({
    constraintId: 'deck.entries',
    constraintIndex: -1,
    code: 'duplicate_entry',
    entryId,
    actual: entryId,
    expected: 'unique entry ids',
  }));

  const constraintIds = new Set<string>();
  for (const [constraintIndex, constraint] of constraints.entries()) {
    if (!constraint || typeof constraint.id !== 'string' || constraint.id.length === 0) {
      throw new TypeError('deck constraint ids must be non-empty strings');
    }
    if (constraintIds.has(constraint.id)) {
      throw new TypeError(`duplicate deck constraint id: ${constraint.id}`);
    }
    constraintIds.add(constraint.id);
    switch (constraint.kind) {
      case 'totalSize':
        assertBound(constraint.min, `${constraint.id} min`);
        assertBound(constraint.max, `${constraint.id} max`);
        if (constraint.min !== undefined && constraint.max !== undefined
          && constraint.min > constraint.max) {
          throw new RangeError(`${constraint.id} min must not exceed max`);
        }
        if (constraint.min !== undefined && totalSize < constraint.min) {
          violations.push({
            constraintId: constraint.id,
            constraintIndex,
            code: 'total_size_below_min',
            actual: totalSize,
            expected: constraint.min,
          });
        }
        if (constraint.max !== undefined && totalSize > constraint.max) {
          violations.push({
            constraintId: constraint.id,
            constraintIndex,
            code: 'total_size_above_max',
            actual: totalSize,
            expected: constraint.max,
          });
        }
        break;
      case 'copiesLimit':
        assertBound(constraint.max, `${constraint.id} max`);
        if (constraint.tag !== undefined
          && (typeof constraint.tag !== 'string' || constraint.tag.length === 0)) {
          throw new TypeError(`${constraint.id} tag must be a non-empty string`);
        }
        for (const entry of entries) {
          if ((constraint.tag === undefined || hasTag(entry, constraint.tag))
            && entry.copies > constraint.max) {
            violations.push({
              constraintId: constraint.id,
              constraintIndex,
              code: 'copies_limit_exceeded',
              entryId: entry.id,
              actual: entry.copies,
              expected: constraint.max,
            });
          }
        }
        break;
      case 'tagCount': {
        if (typeof constraint.tag !== 'string' || constraint.tag.length === 0) {
          throw new TypeError(`${constraint.id} tag must be a non-empty string`);
        }
        assertBound(constraint.min, `${constraint.id} min`);
        assertBound(constraint.max, `${constraint.id} max`);
        if (constraint.min !== undefined && constraint.max !== undefined
          && constraint.min > constraint.max) {
          throw new RangeError(`${constraint.id} min must not exceed max`);
        }
        const count = entries.reduce((sum, entry) => (
          sum + (hasTag(entry, constraint.tag) ? entry.copies : 0)
        ), 0);
        if (constraint.min !== undefined && count < constraint.min) {
          violations.push({
            constraintId: constraint.id,
            constraintIndex,
            code: 'tag_count_below_min',
            actual: count,
            expected: constraint.min,
          });
        }
        if (constraint.max !== undefined && count > constraint.max) {
          violations.push({
            constraintId: constraint.id,
            constraintIndex,
            code: 'tag_count_above_max',
            actual: count,
            expected: constraint.max,
          });
        }
        break;
      }
      case 'factions': {
        if (constraint.allowed && (!Array.isArray(constraint.allowed)
          || constraint.allowed.some((faction: string) => (
            typeof faction !== 'string' || faction.length === 0
          ))
          || new Set(constraint.allowed).size !== constraint.allowed.length)) {
          throw new TypeError(`${constraint.id} allowed factions must be unique strings`);
        }
        assertBound(constraint.maxDistinct, `${constraint.id} maxDistinct`);
        const used = new Set(entries.flatMap((entry) => (
          entry.copies > 0 ? [...(entry.factions ?? [])] : []
        )));
        if (constraint.allowed) {
          for (const faction of [...used].sort()) {
            if (!constraint.allowed.includes(faction)) {
              violations.push({
                constraintId: constraint.id,
                constraintIndex,
                code: 'faction_not_allowed',
                actual: faction,
                expected: constraint.allowed,
              });
            }
          }
        }
        if (constraint.maxDistinct !== undefined && used.size > constraint.maxDistinct) {
          violations.push({
            constraintId: constraint.id,
            constraintIndex,
            code: 'too_many_factions',
            actual: used.size,
            expected: constraint.maxDistinct,
          });
        }
        break;
      }
      default:
        throw new TypeError(`deck constraint ${(constraint as { id: string }).id} kind is invalid`);
    }
  }
  return { valid: violations.length === 0, totalSize, violations };
}
