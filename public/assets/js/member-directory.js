const memberDirectoryDialog = document.getElementById('memberDirectoryDialog');
const memberDirectoryClubSelect = document.getElementById('memberDirectoryClubSelect');
const memberDirectoryList = document.getElementById('memberDirectoryList');
let memberDirectoryClubs = [];
let memberDirectoryMode = 'admin';

function renderMemberDirectory() {
  if (!memberDirectoryList || !memberDirectoryClubSelect) return;
  memberDirectoryList.replaceChildren();
  const selectedId = memberDirectoryClubSelect.value;
  if (memberDirectoryMode === 'pr' && !selectedId) {
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
        level.textContent = member.memberType === 'senior' ? 'Senior member' : 'New member';
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
  const description = document.getElementById('memberDirectoryDescription');
  if (description) description.textContent = isPrView
    ? 'Choose a club to view its member roster.'
    : 'Browse member rosters across every club.';
  memberDirectoryDialog.showModal();
  memberDirectoryList.replaceChildren();
  const loading = document.createElement('p');
  loading.className = 'member-directory-empty';
  loading.textContent = 'Loading club members…';
  memberDirectoryList.append(loading);

  try {
    const endpoint = isPrView ? '/api/committee/club-members' : '/api/admin/club-members';
    const response = await fetch(endpoint, { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Could not load the member directory.');
    memberDirectoryClubs = Array.isArray(result) ? result : [];
    memberDirectoryClubSelect.replaceChildren();
    if (isPrView) {
      memberDirectoryClubSelect.add(new Option('Choose a club', ''));
      memberDirectoryClubSelect.value = '';
    } else {
      memberDirectoryClubSelect.add(new Option('All clubs', 'all'));
      memberDirectoryClubs.forEach((club) => memberDirectoryClubSelect.add(new Option(club.name, String(club.id))));
      memberDirectoryClubSelect.value = 'all';
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

document.querySelectorAll('[data-open-member-directory]').forEach((button) => {
  button.addEventListener('click', () => openMemberDirectory(button.dataset.openMemberDirectory));
});
document.querySelectorAll('[data-close-member-directory]').forEach((button) => {
  button.addEventListener('click', () => memberDirectoryDialog?.close());
});
memberDirectoryClubSelect?.addEventListener('change', renderMemberDirectory);
