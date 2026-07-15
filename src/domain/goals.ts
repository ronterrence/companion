export interface Goal {
  id: string;
  title: string;
  description: string;
  companionIds: string[];
}

export const goals: Goal[] = [
  { id: 'problem', title: 'Think through a problem', description: 'Find what is really going on.', companionIds: ['root-cause', 'decision-coach'] },
  { id: 'support', title: 'Feel supported', description: 'Calm, grounded reflection.', companionIds: ['calm-friend'] },
  { id: 'learn', title: 'Learn something', description: 'Study, revise, and understand.', companionIds: ['study-coach'] },
  { id: 'conversation', title: 'Prepare for a conversation', description: 'Plan what to say clearly.', companionIds: ['meeting-prep', 'decision-coach'] },
  { id: 'decision', title: 'Make a decision', description: 'Compare options and tradeoffs.', companionIds: ['decision-coach', 'root-cause'] },
  { id: 'custom', title: 'Create my own companion', description: 'Start from a plain-language idea.', companionIds: [] },
];
