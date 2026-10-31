import { majorVersionIncrement } from './normalize.js';
import type { VersionScheme } from './types.js';

export type WarningCode = 'major_release' | 'possible_breaking_change' | 'migration_mentioned' | 'deprecation_mentioned';
export interface ReleaseWarning {
  readonly code: WarningCode;
  readonly label: string;
  readonly evidence: string;
  readonly releaseUrl: string;
  readonly advisory: true;
}
const rules: readonly { code: WarningCode; label: string; pattern: RegExp }[] = [
  { code: 'possible_breaking_change', label: 'Possible breaking change', pattern: /\bbreaking[ -]changes?\b|\bnot backwards? compatible\b|\bincompatible with previous\b/gi },
  { code: 'migration_mentioned', label: 'Migration mentioned', pattern: /\bmanual migration\b|\bmigration (?:is )?required\b|\b(?:database )?schema migration\b|\b(?:manual|required) upgrade steps\b/gi },
  { code: 'deprecation_mentioned', label: 'Deprecation mentioned', pattern: /\bdeprecated\b|\bno longer supported\b|\bremoved\b/gi },
];

function plainText(notes: string): string {
  return notes.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
}

export function classifyRelease(input: {
  readonly notesText: string;
  readonly releaseUrl: string;
  readonly previousTag: string | null;
  readonly currentTag: string | null;
  readonly versionScheme: VersionScheme;
}): ReleaseWarning[] {
  const warnings: ReleaseWarning[] = [];
  const add = (code: WarningCode, label: string, evidence: string) => warnings.push({
    code, label, evidence: evidence.slice(0, 240), releaseUrl: input.releaseUrl, advisory: true,
  });
  if (majorVersionIncrement(input.previousTag, input.currentTag, input.versionScheme)) {
    add('major_release', 'Major version increment', `${input.previousTag} → ${input.currentTag}`);
  }
  const text = plainText(input.notesText).slice(0, 262_144);
  // Work per clause: a negated statement cannot mask a later positive statement.
  const clauses = text.split(/\n|[.!?;](?:\s|$)|\bbut\b/gi);
  for (const rule of rules) {
    let found = false;
    for (const clause of clauses) {
      for (const match of clause.matchAll(new RegExp(rule.pattern))) {
        const index = match.index;
        const prefix = clause.slice(Math.max(0, index - 60), index);
        const suffix = clause.slice(index + match[0].length, index + match[0].length + 60);
        if (/\b(?:no|without|not|never|nothing)\s+(?:(?:known|any|new|additional)\s+)*$/i.test(prefix) ||
            /^\s*:?\s*(?:(?:are|were|is|was)\s+)?(?:not\s+(?:present|included|required|introduced)|none\b)/i.test(suffix)) continue;
        add(rule.code, rule.label, clause.trim()); found = true; break;
      }
      if (found) break;
    }
  }
  return warnings;
}
