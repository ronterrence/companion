export function renderGoalCard(goal) {
  return `
    <div class="card click-card goal-card" data-action="select-goal" data-goal-id="${goal.id}">
      <div class="goal-card-copy">
        <h3>${goal.title}</h3>
        <p>${goal.desc}</p>
      </div>
      <span class="goal-arrow">&rarr;</span>
    </div>`;
}

export function renderCompanionCard(companionKey, companion) {
  const styleLabel = companion.style.split('·')[0].trim();
  return `
    <div class="card companion-card">
      <div>
        <h3>${companion.name}</h3>
        <p>${companion.purpose}</p>
        <div class="status-strip status-strip-inline">
          <span class="badge">${styleLabel}</span>
          <span class="badge memory">Session only</span>
          <span class="badge safety">Safety on</span>
          <span class="badge local">Local first</span>
        </div>
      </div>
      <div class="actions">
        <button class="primary-btn" data-action="review-companion" data-companion-key="${companionKey}">Review & Start</button>
      </div>
    </div>`;
}

export function renderBoundaryItems(items, type) {
  const markerClass = type === 'can' ? 'check' : 'cross';
  const marker = type === 'can' ? '&check;' : '&times;';
  return items
    .map((item) => `<li><span class="${markerClass}">${marker}</span><span>${item}</span></li>`)
    .join('');
}

export function renderLibraryRow(companionKey, companion) {
  return `
    <div class="card library-row">
      <div class="library-row-copy">
        <h3>${companion.name}</h3>
        <p>${companion.purpose}</p>
        <div class="status-strip status-strip-inline">
          <span class="badge local">Local first</span>
          <span class="badge memory">Session memory</span>
          <span class="badge safety">Safety on</span>
        </div>
      </div>
      <div class="library-row-actions">
        <button class="primary-btn" data-action="review-companion" data-companion-key="${companionKey}">Use</button>
        <button class="ghost-btn" data-action="export-library-companion" data-companion-key="${companionKey}">Export</button>
      </div>
    </div>`;
}

export function renderMessage(message) {
  const authorLine = message.author ? `<strong>${message.author}</strong><br>` : '';
  return `<div class="message ${message.role}">${authorLine}${message.text}</div>`;
}
