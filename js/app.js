import {
  showScreen,
  renderGoals,
  selectGoal,
  renderLibrary,
  reviewCompanion,
  startSession,
  sendMessage,
  switchToCompanion,
  hideSwitchSuggestion,
  showSummary,
  exportCompanion,
  exportLibraryCompanion,
  deleteSession,
} from './ui/screens.js';
import {
  openCloudModal,
  closeCloudModal,
  allowCloud,
  openCreator,
  closeCreator,
  nextCreatorStep,
  previousCreatorStep,
  handleBackdropClick,
} from './ui/modals.js';

function handleAction(action, element) {
  switch (action) {
    case 'select-goal':
      selectGoal(element.dataset.goalId, openCreator);
      break;
    case 'review-companion':
      reviewCompanion(element.dataset.companionKey);
      break;
    case 'back-to-recommendations':
      showScreen('recommendations');
      break;
    case 'start-session':
      startSession();
      break;
    case 'send-message':
      sendMessage();
      break;
    case 'switch-to-calm':
      switchToCompanion('calm');
      break;
    case 'hide-switch':
      hideSwitchSuggestion();
      break;
    case 'show-summary':
      showSummary();
      break;
    case 'open-cloud-modal':
      openCloudModal();
      break;
    case 'close-cloud-modal':
      closeCloudModal();
      break;
    case 'allow-cloud':
      allowCloud();
      break;
    case 'open-creator':
      openCreator();
      break;
    case 'close-creator':
      closeCreator();
      break;
    case 'creator-next':
      nextCreatorStep();
      break;
    case 'creator-back':
      previousCreatorStep();
      break;
    case 'export-companion':
      exportCompanion();
      break;
    case 'export-library-companion':
      exportLibraryCompanion(element.dataset.companionKey);
      break;
    case 'delete-session':
      deleteSession();
      break;
    default:
      break;
  }
}

function bindEvents() {
  document.addEventListener('click', (event) => {
    const actionElement = event.target.closest('[data-action]');
    if (actionElement) {
      handleAction(actionElement.dataset.action, actionElement);
      return;
    }

    const screenElement = event.target.closest('[data-screen]');
    if (screenElement) {
      showScreen(screenElement.dataset.screen);
      return;
    }

    if (event.target.classList.contains('choice')) {
      event.target.classList.toggle('selected');
      return;
    }

    if (event.target.classList.contains('modal-backdrop')) {
      handleBackdropClick(event.target);
    }
  });

  document.getElementById('chatInput')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
}

function init() {
  bindEvents();
  renderGoals();
  renderLibrary();
  showScreen('home');
}

init();
