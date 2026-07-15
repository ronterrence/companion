import { goals } from '../data/goals.js';
import { companions } from '../data/companions.js';
import {
  state,
  setScreen,
  setGoal,
  setCompanionKey,
  addMessage,
  resetSessionMessages,
  resetSessionState,
  setCloudAllowed,
} from '../state.js';
import {
  renderGoalCard,
  renderCompanionCard,
  renderBoundaryItems,
  renderLibraryRow,
  renderMessage,
} from './components.js';
import { escapeHtml } from '../utils/escape-html.js';

function getCurrentCompanion() {
  return companions[state.currentCompanionKey];
}

export function showScreen(screenId) {
  setScreen(screenId);
  document.querySelectorAll('.screen').forEach((screen) => {
    screen.classList.toggle('active', screen.id === screenId);
  });
  document.querySelectorAll('.nav-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.screen === screenId);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function renderGoals() {
  document.getElementById('goalGrid').innerHTML = goals.map(renderGoalCard).join('');
}

export function selectGoal(goalId, openCreator) {
  const goal = goals.find((item) => item.id === goalId);
  if (!goal) return;
  if (goal.id === 'custom') {
    openCreator();
    return;
  }

  setGoal(goal);
  document.getElementById('goalTitle').textContent = goal.title;
  document.getElementById('goalSubtitle').textContent = 'These companions can help with that.';
  document.getElementById('recommendationList').innerHTML = goal.companions
    .map((key) => renderCompanionCard(key, companions[key]))
    .join('');
  showScreen('recommendations');
}

export function renderLibrary() {
  document.getElementById('libraryList').innerHTML = Object.entries(companions)
    .map(([key, companion]) => renderLibraryRow(key, companion))
    .join('');
}

export function reviewCompanion(companionKey) {
  const companion = companions[companionKey];
  if (!companion) return;

  setCompanionKey(companionKey);
  document.getElementById('detailName').textContent = companion.name;
  document.getElementById('detailPurpose').textContent = companion.purpose;
  document.getElementById('detailStyle').textContent = companion.style;
  document.getElementById('detailAge').textContent = companion.age;
  document.getElementById('canList').innerHTML = renderBoundaryItems(companion.can, 'can');
  document.getElementById('cannotList').innerHTML = renderBoundaryItems(companion.cannot, 'cannot');
  showScreen('detail');
}

export function startSession() {
  const companion = getCurrentCompanion();
  resetSessionState();
  addMessage('ai', companion.opening, companion.name);
  document.getElementById('chatName').textContent = companion.name;
  document.getElementById('cloudStatusBadge').textContent = 'Cloud used: No';
  document.getElementById('chatInput').value = '';
  hideSwitchSuggestion();
  renderMessages();
  showScreen('chat');
}

export function renderMessages() {
  document.getElementById('messages').innerHTML = state.messages.map(renderMessage).join('');
}

export function sendMessage() {
  const input = document.getElementById('chatInput');
  const rawText = input.value.trim();
  if (!rawText) return;

  const safeText = escapeHtml(rawText);
  addMessage('user', safeText);
  input.value = '';
  renderMessages();

  if (/stress|overwhelm|panic|anxious|scared/i.test(rawText) && state.currentCompanionKey !== 'calm') {
    showSwitchSuggestion();
  }

  const companion = getCurrentCompanion();
  window.setTimeout(() => {
    addMessage('ai', companion.reply, companion.name);
    renderMessages();
  }, 350);
}

export function switchToCompanion(companionKey) {
  const companion = companions[companionKey];
  if (!companion) return;

  setCompanionKey(companionKey);
  document.getElementById('chatName').textContent = companion.name;
  addMessage('ai', companion.opening, companion.name);
  renderMessages();
  hideSwitchSuggestion();
}

export function showSwitchSuggestion() {
  document.getElementById('switchSuggestion').classList.remove('hidden');
}

export function hideSwitchSuggestion() {
  document.getElementById('switchSuggestion').classList.add('hidden');
}

export function showSummary() {
  const companion = getCurrentCompanion();
  document.getElementById('summaryCompanion').textContent = companion.name;
  document.getElementById('summaryNext').textContent = companion.next;
  document.getElementById('summaryExplored').textContent = `You explored your session with ${companion.name}.`;
  document.getElementById('summaryTakeaway').textContent = 'The session stayed local-first, used session memory only, and kept safety boundaries visible.';
  showScreen('summary');
}

function downloadCompanion(companion) {
  const data = {
    schema_version: '0.1',
    name: companion.name,
    purpose: companion.purpose,
    style: companion.style,
    can_do: companion.can,
    cannot_do: companion.cannot,
    memory: 'session_only',
    age_suitability: companion.age,
    execution: 'local_first',
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${companion.name.toLowerCase().replaceAll(' ', '_')}.companion.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportCompanion() {
  downloadCompanion(getCurrentCompanion());
}

export function exportLibraryCompanion(companionKey) {
  const companion = companions[companionKey];
  if (!companion) return;
  downloadCompanion(companion);
}

export function deleteSession() {
  resetSessionState();
  setCloudAllowed(false);
  document.getElementById('cloudStatusBadge').textContent = 'Cloud used: No';
  document.getElementById('chatInput').value = '';
  hideSwitchSuggestion();
  showScreen('home');
}
