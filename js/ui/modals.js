import { state, setCreatorStep, setCloudAllowed } from '../state.js';

function toggleModal(modalId, isOpen) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.toggle('active', isOpen);
  modal.setAttribute('aria-hidden', String(!isOpen));
}

export function openCloudModal() {
  toggleModal('cloudModal', true);
}

export function closeCloudModal() {
  toggleModal('cloudModal', false);
}

export function allowCloud() {
  setCloudAllowed(true);
  document.getElementById('cloudStatusBadge').textContent = 'Cloud used: Allowed once';
  closeCloudModal();
}

export function openCreator() {
  setCreatorStep(0);
  updateCreator();
  toggleModal('creatorModal', true);
}

export function closeCreator() {
  toggleModal('creatorModal', false);
}

export function nextCreatorStep() {
  if (state.creatorStep < 4) setCreatorStep(state.creatorStep + 1);
  else closeCreator();
  updateCreator();
}

export function previousCreatorStep() {
  if (state.creatorStep > 0) setCreatorStep(state.creatorStep - 1);
  updateCreator();
}

export function updateCreator() {
  document.querySelectorAll('.creator-step').forEach((stepElement, index) => {
    stepElement.classList.toggle('active', index === state.creatorStep);
  });

  const stepLabel = document.getElementById('creatorStepLabel');
  if (stepLabel) {
    stepLabel.textContent = `Step ${state.creatorStep + 1} of 5`;
  }

  const nextButton = document.getElementById('creatorNext');
  if (nextButton) {
    nextButton.textContent = state.creatorStep === 4 ? 'Create companion' : 'Next';
  }

  if (state.creatorStep === 4) {
    const purpose = document.getElementById('creatorPurpose')?.value?.trim();
    document.getElementById('reviewPurpose').textContent = purpose || 'Helps you stay calm and plan your week.';
  }
}

export function handleBackdropClick(target) {
  if (target.id === 'cloudModal') closeCloudModal();
  if (target.id === 'creatorModal') closeCreator();
}
