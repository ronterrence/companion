// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { companions } from '../domain/companions';
import { validateManifest } from '../domain/policy';

const root = resolve(import.meta.dirname, '../..');
const requiredArtifacts = [
  'docs/acceptance-matrix.md', 'docs/architecture.md', 'docs/threat-model.md',
  'docs/ai-system-register.md', 'docs/evaluation-plan.md', 'docs/dpia-template.md',
  'docs/incident-response.md', 'docs/model-evaluation-record-template.md', 'docs/release-checklist.md',
];

describe('compliance and release foundation', () => {
  it('tracks exactly nine numbered acceptance stages with repository evidence', () => {
    const matrix = readFileSync(resolve(root, 'docs/acceptance-matrix.md'), 'utf8');
    const stages = [...matrix.matchAll(/^\| (\d)\. ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm)];
    expect(stages.map((match) => Number(match[1]))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    stages.forEach((match) => {
      expect(match[2].trim().length).toBeGreaterThan(3);
      expect(match[3].trim().length).toBeGreaterThan(10);
      expect(match[4].trim().length).toBeGreaterThan(3);
      expect(match[5].trim()).toMatch(/Implemented|Integrated|foundation/i);
    });
  });

  it.each(requiredArtifacts)('contains a non-placeholder %s', (relativePath) => {
    const content = readFileSync(resolve(root, relativePath), 'utf8');
    expect(content.length).toBeGreaterThan(300);
    expect(content).not.toMatch(/\bTODO\b/);
  });

  it('keeps every bundled companion inside supported risk classes', () => {
    companions.forEach((companion) => {
      expect(validateManifest(companion)).toEqual(companion);
      expect(['minimal', 'limited']).toContain(companion.riskClass);
    });
  });

  it('documents production release as gated rather than compliant by assertion', () => {
    const checklist = readFileSync(resolve(root, 'docs/release-checklist.md'), 'utf8');
    expect(checklist).toContain('- [ ]');
    expect(checklist).toContain('AI Act classification');
    expect(checklist).toContain('DPIA');
  });
});
