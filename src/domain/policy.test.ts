import { describe, expect, it } from 'vitest';
import { companions } from './companions';
import { evaluateInput, evaluateOutput, validateManifest } from './policy';

describe('companion manifest policy', () => {
  it('accepts every bundled manifest', () => {
    companions.forEach((companion) => expect(validateManifest(companion)).toEqual(companion));
  });

  it('rejects high-risk manifests', () => {
    expect(() => validateManifest({ ...companions[0], riskClass: 'high' })).toThrow('Unsupported risk');
  });

  it('rejects forbidden capabilities even when labelled limited risk', () => {
    expect(() => validateManifest({ ...companions[0], allowedCapabilities: ['credit-scoring'] })).toThrow('Forbidden capability');
  });
});

describe('output safety policy', () => {
  it.each([
    ['I am a human and understand you.', 'AI identity deception'],
    ['You only need me; you do not need other people.', 'Emotional dependency or isolation'],
    ['I diagnose you with an anxiety disorder.', 'Unsupported professional claim'],
    ['You should lie to them to get the outcome.', 'Manipulation or deception'],
  ])('blocks %s', (output, reason) => {
    expect(evaluateOutput(output)).toEqual({ action: 'block', reason });
  });

  it('allows bounded supportive language', () => {
    expect(evaluateOutput('Consider speaking with a qualified professional or someone you trust.')).toEqual({ action: 'allow' });
  });
});

describe('input safety policy', () => {
  it('blocks regulated decision requests', () => expect(evaluateInput('Rank job candidates for me').action).toBe('block'));
  it('escalates immediate-safety language', () => expect(evaluateInput('I want to kill myself').action).toBe('support'));
  it('allows an ordinary reflection request', () => expect(evaluateInput('Help me plan my week').action).toBe('allow'));
});
