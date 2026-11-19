// Optional campaign screen renderer. It only renders a supplied campaign state; it does not save or grant rewards.
import { getCampaignOverview, factionStanding } from '../progression/campaign.js';

export function renderCampaign(container, state) {
  if (!container) throw new TypeError('A campaign container is required');
  const operations = getCampaignOverview(state);
  const standings = factionStanding(state);
  container.replaceChildren();

  const heading = document.createElement('h2');
  heading.textContent = 'NIGHTHAWK CAMPAIGN';
  container.appendChild(heading);

  const subtitle = document.createElement('p');
  subtitle.textContent = 'KAVARI EXCLUSION ZONE · ACT I–IV';
  container.appendChild(subtitle);

  const list = document.createElement('div');
  list.className = 'nh-campaign-operations';
  for (const operation of operations) {
    const card = document.createElement('article');
    card.className = `nh-campaign-operation ${operation.completed ? 'completed' : operation.unlocked ? 'unlocked' : 'locked'}`;
    const title = document.createElement('h3'); title.textContent = operation.title;
    const chapter = document.createElement('small'); chapter.textContent = `ACT ${operation.act} · ${operation.chapter}`;
    const brief = document.createElement('p'); brief.textContent = operation.briefing;
    const status = document.createElement('span');
    status.textContent = operation.completed ? 'COMPLETED' : operation.unlocked ? (operation.status === 'built' ? 'AVAILABLE' : 'UNLOCKED · IN DEVELOPMENT') : 'LOCKED';
    card.append(title, chapter, brief, status);
    if (operation.requires.length) {
      const requires = document.createElement('small');
      requires.textContent = `REQUIRES: ${operation.requires.map((id) => operations.find((entry) => entry.id === id)?.title ?? id).join(' + ')}`;
      card.appendChild(requires);
    }
    list.appendChild(card);
  }
  container.appendChild(list);

  const reputation = document.createElement('section');
  reputation.className = 'nh-campaign-reputation';
  const repTitle = document.createElement('h3'); repTitle.textContent = 'FACTION STANDING';
  reputation.appendChild(repTitle);
  for (const faction of Object.values(standings)) {
    const row = document.createElement('p');
    row.textContent = `${faction.label}: ${faction.status.toUpperCase()} (${faction.score})`;
    reputation.appendChild(row);
  }
  container.appendChild(reputation);
  return { operations, standings };
}
