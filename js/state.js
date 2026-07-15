export const state = {
  currentScreen: 'home',
  currentGoal: null,
  currentCompanionKey: 'root',
  creatorStep: 0,
  cloudAllowed: false,
  messages: [],
};

export function setScreen(screenId) {
  state.currentScreen = screenId;
}

export function setGoal(goal) {
  state.currentGoal = goal;
}

export function setCompanionKey(companionKey) {
  state.currentCompanionKey = companionKey;
}

export function setCreatorStep(step) {
  state.creatorStep = step;
}

export function setCloudAllowed(value) {
  state.cloudAllowed = value;
}

export function resetSessionState() {
  state.cloudAllowed = false;
  state.messages = [];
}

export function addMessage(role, text, author = '') {
  state.messages.push({ role, text, author });
}

export function resetSessionMessages() {
  state.messages = [];
}
