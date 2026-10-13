const memberDirectoryDialog = document.getElementById('memberDirectoryDialog');
const memberDirectoryClubSelect = document.getElementById('memberDirectoryClubSelect');
const memberDirectoryList = document.getElementById('memberDirectoryList');
let memberDirectoryClubs = [];
let memberDirectoryMode = 'admin';
const memberDirectoryCache = new Map();
const memberDirectoryRequests = new Map();

function renderMemberDirectory() {
  if (!memberDirectoryList || !memberDirectoryClubSelect) return;
  memberDirectoryList.replaceChildren();
  if (!memberDirectoryClubs.length) {
    const empty = document.createElement('p');
    empty.className = 'member-directory-empty';
    empty.textContent = 'No clubs were returned by the member directory.';
    memberDirectoryList.append(empty);
    return;
  }
  const selectedId = memberDirectoryClubSelect.value;
  if (!selectedId) {
    const prompt = document.createElement('p');
    prompt.className = 'member-directory-empty';
    prompt.textContent = 'Choose a club to see its members.';
    memberDirectoryList.append(prompt);
    return;
  }

  const clubs = selectedId === 'all'
    ? memberDirectoryClubs
    : memberDirectoryClubs.filter((club) => String(club.id) === selectedId);
  if (!clubs.length) {
    const empty = document.createElement('p');
    empty.className = 'member-directory-empty';
    empty.textContent = 'No clubs are available.';
    memberDirectoryList.append(empty);
    return;
  }

  clubs.forEach((club) => {
    const group = document.createElement('section');
    group.className = 'member-directory-club';
    const heading = document.createElement('header');
    const title = document.createElement('h3');
    title.textContent = club.name;
    const count = document.createElement('span');
    const members = Array.isArray(club.members) ? club.members : [];
    count.textContent = `${members.length} named · ${Number(club.totalCount) || 0} total`;
    heading.append(title, count);
    group.append(heading);

    if (!members.length) {
      const empty = document.createElement('p');
      empty.className = 'member-directory-empty';
      empty.textContent = 'No named profiles have been added for this club yet.';
      group.append(empty);
    } else {
      const list = document.createElement('div');
      list.className = 'member-directory-people';
      members.forEach((member) => {
        const row = document.createElement('article');
        row.className = 'member-directory-person';
        const details = document.createElement('div');
        const name = document.createElement('strong');
        name.textContent = member.name || 'Unnamed member';
        const meta = document.createElement('p');
        meta.textContent = [member.committee, member.position].filter(Boolean).join(' · ') || 'No committee or position';
        details.append(name, meta);
        const level = document.createElement('span');
        level.className = 'member-directory-level';
        level.textContent = member.source === 'accepted-application'
          ? 'Accepted applicant'
          : member.memberType === 'senior' ? 'Senior member' : 'New member';
        row.append(details, level);
        list.append(row);
      });
      group.append(list);
    }
    if (members.length < (Number(club.totalCount) || 0)) {
      const note = document.createElement('p');
      note.className = 'member-directory-note';
      note.textContent = `${Number(club.totalCount) - members.length} members are included in the club total but do not have named profiles yet.`;
      group.append(note);
    }
    memberDirectoryList.append(group);
  });
}

async function openMemberDirectory(mode) {
  if (!memberDirectoryDialog || !memberDirectoryClubSelect || !memberDirectoryList) return;
  memberDirectoryMode = mode;
  const isPrView = mode === 'pr';
  const isHeadView = mode === 'head';
  const description = document.getElementById('memberDirectoryDescription');
  if (description) description.textContent = isPrView
    ? 'Choose a club to view its member roster.'
    : isHeadView ? 'Members accepted into your committee, plus its named roster.'
      : 'Browse member rosters across every club.';
  const filter = memberDirectoryClubSelect.closest('.member-directory-filter');
  if (filter) {
    filter.hidden = isHeadView;
    filter.classList.toggle('hidden', isHeadView);
  }
  const inlineDirectory = isPrView && memberDirectoryDialog.classList.contains('committee-inline-panel')
    && window.dashboardPanels;
  if (inlineDirectory) window.dashboardPanels.show('memberDirectoryDialog');
  else {
    memberDirectoryDialog.hidden = false;
    if (!memberDirectoryDialog.open) memberDirectoryDialog.showModal();
  }
  const cachedDirectory = memberDirectoryCache.get(mode);
  const directoryIsWarm = cachedDirectory && Date.now() - cachedDirectory.loadedAt < 25_000;
  if (!directoryIsWarm) {
    memberDirectoryList.replaceChildren();
    const loading = document.createElement('p');
    loading.className = 'member-directory-empty';
    loading.textContent = 'Loading club members…';
    memberDirectoryList.append(loading);
  }

  try {
    memberDirectoryClubs = await loadMemberDirectoryData(mode);
    if (isPrView || isHeadView) updateClubMemberUnreadCount(memberDirectoryClubs);
    memberDirectoryClubSelect.replaceChildren();
    if (isPrView) {
      memberDirectoryClubSelect.add(new Option('Choose a club', ''));
      memberDirectoryClubs.forEach((club) => memberDirectoryClubSelect.add(new Option(club.name, String(club.id))));
      memberDirectoryClubSelect.value = '';
    } else if (isHeadView) {
      memberDirectoryClubSelect.add(new Option(memberDirectoryClubs[0]?.name || 'My committee', String(memberDirectoryClubs[0]?.id || '')));
      memberDirectoryClubSelect.value = String(memberDirectoryClubs[0]?.id || '');
    } else {
      memberDirectoryClubSelect.add(new Option('Choose a club', ''));
      memberDirectoryClubs.forEach((club) => memberDirectoryClubSelect.add(new Option(club.name, String(club.id))));
      memberDirectoryClubSelect.value = '';
    }
    renderMemberDirectory();
  } catch (error) {
    memberDirectoryList.replaceChildren();
    const message = document.createElement('p');
    message.className = 'member-directory-empty is-error';
    message.textContent = error.message;
    memberDirectoryList.append(message);
  }
}

async function loadMemberDirectoryData(mode, force = false) {
  const cached = memberDirectoryCache.get(mode);
  if (!force && cached && Date.now() - cached.loadedAt < 25_000) return cached.clubs;
  if (!force && memberDirectoryRequests.has(mode)) return memberDirectoryRequests.get(mode);
  const request = (async () => {
    let clubs;
    if (mode === 'pr') {
      const [publicResponse, rosterResponse] = await Promise.all([
        fetch('/api/clubs?media=links', { cache: 'no-store' }),
        fetch('/api/committee/club-members', { cache: 'no-store', credentials: 'same-origin' })
      ]);
      const publicClubs = await publicResponse.json();
      const rosterResult = await rosterResponse.json();
      if (!publicResponse.ok) throw new Error(publicClubs.message || 'Could not load the clubs list.');
      if (!rosterResponse.ok) throw new Error(rosterResult.message || 'Could not load club members.');
      const rosterClubs = Array.isArray(rosterResult) ? rosterResult : Array.isArray(rosterResult.clubs) ? rosterResult.clubs : [];
      const rosterById = new Map(rosterClubs.map((club) => [Number(club.id), club]));
      clubs = (Array.isArray(publicClubs) ? publicClubs : []).map((club) => {
        const roster = rosterById.get(Number(club.id));
        return {
          ...club,
          totalCount: Number.isFinite(Number(roster?.totalCount)) ? Number(roster.totalCount) : Number(club.members) || 0,
          members: Array.isArray(roster?.members) ? roster.members : []
        };
      });
    } else if (mode === 'head') {
      const response = await fetch('/api/club/members', { cache: 'no-store', credentials: 'same-origin' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Could not load your committee members.');
      clubs = [{ id: result.clubId, name: `${result.clubName} · ${result.committee}`, members: Array.isArray(result.members) ? result.members : [], totalCount: Number(result.totalCount) || 0 }];
    } else {
      const response = await fetch('/api/admin/club-members', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Could not load the member directory.');
      clubs = Array.isArray(result) ? result : Array.isArray(result.clubs) ? result.clubs : [];
    }
    memberDirectoryCache.set(mode, { clubs, loadedAt: Date.now() });
    if (mode === 'pr' || mode === 'head') updateClubMemberUnreadCount(clubs);
    if (mode === 'pr') window.dashboardSync?.report('clubMembers', 'success');
    return clubs;
  })();
  memberDirectoryRequests.set(mode, request);
  try { return await request; }
  finally { if (memberDirectoryRequests.get(mode) === request) memberDirectoryRequests.delete(mode); }
}

window.preloadMemberDirectory = (mode, force = false) => loadMemberDirectoryData(mode, force);

function updateClubMemberUnreadCount(clubs) {
  const keys = [];
  (Array.isArray(clubs) ? clubs : []).forEach((club) => {
    (Array.isArray(club.members) ? club.members : []).forEach((member) => {
      keys.push(`${club.id}:${member.createdAt || `${member.name || ''}:${member.committee || ''}:${member.position || ''}`}`);
    });
  });
  window.dashboardUnread?.update('clubMembers', keys);
}

async function refreshClubMemberUnreadCount() {
  if (!document.getElementById('prMemberDirectoryBtn')) return;
  window.dashboardSync?.report('clubMembers', 'loading');
  try {
    const response = await fetch('/api/committee/club-members', { cache: 'no-store' });
    const clubs = await response.json();
    if (!response.ok) throw new Error(clubs.message || 'Could not load club members.');
    if (!Array.isArray(clubs)) throw new Error('Unexpected club members response.');
    updateClubMemberUnreadCount(clubs);
    window.dashboardSync?.report('clubMembers', 'success');
  } catch (error) {
    window.dashboardSync?.report('clubMembers', 'error', error.message);
  }
}

document.querySelectorAll('[data-open-member-directory]').forEach((button) => {
  button.addEventListener('click', () => openMemberDirectory(button.dataset.openMemberDirectory));
});
document.querySelectorAll('[data-close-member-directory]').forEach((button) => {
  button.addEventListener('click', () => {
    if (memberDirectoryMode === 'pr' && memberDirectoryDialog?.classList.contains('committee-inline-panel')
      && window.dashboardPanels) window.dashboardPanels.showOverview();
    else memberDirectoryDialog?.close();
  });
});
memberDirectoryClubSelect?.addEventListener('change', renderMemberDirectory);
window.openClubMemberDirectory = openMemberDirectory;
if (document.getElementById('prMemberDirectoryBtn')) {
  const preloadPrMemberDirectory = () => loadMemberDirectoryData('pr').catch((error) => {
    window.dashboardSync?.report('clubMembers', 'error', error.message);
  });
  if (window.siteStartup?.afterStartup) window.siteStartup.afterStartup(preloadPrMemberDirectory);
  else preloadPrMemberDirectory();
} else refreshClubMemberUnreadCount();
window.addEventListener('dashboard:refresh', refreshClubMemberUnreadCount);
window.setInterval(() => {
  if (document.visibilityState === 'visible') refreshClubMemberUnreadCount();
}, 30000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshClubMemberUnreadCount();
});
