import { z } from 'zod';
import type { CompanionManifest } from './types';

const forbiddenCapabilities = new Set([
  'credit-scoring', 'candidate-ranking', 'medical-diagnosis', 'biometric-categorisation',
  'emotion-recognition-biometric', 'dependency-encouragement', 'subliminal-manipulation',
]);

export const manifestSchema = z.object({
  schemaVersion: z.literal('1.0'), id: z.string().min(2), name: z.string().min(2),
  purpose: z.string().min(10), style: z.array(z.string()).min(1), minimumAge: z.number().int().min(13),
  riskClass: z.enum(['minimal', 'limited', 'high', 'prohibited']),
  allowedCapabilities: z.array(z.string()), prohibitedCapabilities: z.array(z.string()),
  memoryPolicy: z.enum(['session-only', 'explicit-consent']),
  cloudPolicy: z.enum(['disabled', 'ask-every-time', 'ask-per-session']), policyVersion: z.string().min(1),
  opening: z.string().min(1), reply: z.string().min(1),
});

export function validateManifest(input: unknown): CompanionManifest {
  const manifest = manifestSchema.parse(input);
  if (manifest.riskClass === 'high' || manifest.riskClass === 'prohibited') {
    throw new Error(`Unsupported risk classification: ${manifest.riskClass}`);
  }
  const forbidden = manifest.allowedCapabilities.find((item) => forbiddenCapabilities.has(item));
  if (forbidden) throw new Error(`Forbidden capability: ${forbidden}`);
  return manifest;
}

export type SafetyDecision = { action: 'allow' | 'support' | 'block'; reason?: string };

export function evaluateInput(text: string): SafetyDecision {
  if (/rank (job )?candidates|credit score|diagnose me/i.test(text)) {
    return { action: 'block', reason: 'This request requires a regulated or prohibited decision context.' };
  }
  if (/suicide|kill myself|end my life|self[- ]harm/i.test(text)) {
    return { action: 'support', reason: 'Potential immediate-safety concern detected.' };
  }
  return { action: 'allow' };
}

const unsafeOutputRules: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bI am (?:a human|human|conscious|sentient|your therapist|your doctor)\b/i, reason: 'AI identity deception' },
  { pattern: /(?:you only need me|you do not need (?:anyone|other people)|don't tell anyone|keep this between us|never leave me)/i, reason: 'Emotional dependency or isolation' },
  { pattern: /(?:I diagnose you|you definitely have [a-z -]+ disorder|guaranteed (?:legal|financial|medical) outcome)/i, reason: 'Unsupported professional claim' },
  { pattern: /(?:lie to them|manipulate them|coerce them|hide this from your)/i, reason: 'Manipulation or deception' },
];

export function evaluateOutput(text: string): SafetyDecision {
  const violation = unsafeOutputRules.find(({ pattern }) => pattern.test(text));
  return violation ? { action: 'block', reason: violation.reason } : { action: 'allow' };
}
