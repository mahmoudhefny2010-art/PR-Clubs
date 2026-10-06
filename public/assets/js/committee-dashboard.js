const sessionMessage = document.getElementById('sessionMessage');
const hintText = document.getElementById('hintText');
const requestsList = document.getElementById('requestsList');
const requestDialog = document.getElementById('requestDialog');
const requestDetails = document.getElementById('requestDetails');
const statusOverviewDialog = document.getElementById('statusOverviewDialog');
const statusOverviewList = document.getElementById('statusOverviewList');
const reviewHistoryDialog = document.getElementById('reviewHistoryDialog');
const reviewHistoryList = document.getElementById('reviewHistoryList');
let currentRole = '';
let activeRequest = null;
let activeReviewHistoryItem = null;
let historyReturnTarget = '';
let activeDetailContext = 'pending';
let currentRequests = [];
let statusOverviewMode = 'all';

async function ensureSession() {
  try {
    const response = await fetch('/api/club-auth/session');
    const data = await response.json();
    if (!data.authenticated || !data.club) {
      sessionMessage.textContent = 'Please sign in with a PR / English / Dean account.';
      return false;
    }
    if (!['pr', 'english', 'dean'].includes(data.club.role)) {
      sessionMessage.textContent = 'This dashboard is for PR, English Department, or the Dean.';
      return false;
    }
    currentRole = data.club.role;
    const titles = { pr: 'PR Department — Approvals', english: 'English Department — Preview & Approve', dean: 'Dean — Final Approval' };
    document.getElementById('committeeTitle').textContent = titles[currentRole];
    if (currentRole === 'english') document.getElementById('openStatusOverviewBtn').textContent = 'Restart Review';
    hintText.textContent = currentRole === 'pr'
      ? 'Pending requests from clubs. Approve, reject, or comment.'
      : currentRole === 'english'
        ? 'Requests approved by PR. Preview, approve, reject, or request changes.'
        : 'Requests approved by English Department. Final approve or reject.';
    document.getElementById('requestChangesBtn').hidden = !['pr', 'english'].includes(currentRole);
    return true;
  } catch {
    sessionMessage.textContent = 'Could not check your session.';
    return false;
  }
}

function addDetail(label, value, wide = false) {
  const section = document.createElement('section');
  section.className = `detail-item${wide ? ' detail-wide' : ''}`;
  const heading = document.createElement('h3');
  heading.textContent = label;
  const content = document.createElement('p');
  content.textContent = value || 'Not provided';
  section.append(heading, content);
  requestDetails.append(section);
}

function formatStatus(status) {
  return String(status || 'unknown').replaceAll('_', ' ');
}

function hasCurrentApproval(item, role) {
  const history = Array.isArray(item.workflowHistory)
    ? [...item.workflowHistory].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    : [];
  const approvalIndex = history.reduce((latest, event, index) => event.role === role && event.action === 'approve' ? index : latest, -1);
  if (approvalIndex < 0) return false;
  return !history.slice(approvalIndex + 1).some((event) => {
    if (event.role === 'dean' && event.action === 'returned_to_pr') return true;
    if (event.role === 'dean' && event.action === 'returned_to_english') return ['english', 'dean'].includes(role);
    if (event.action === 'restarted_review' || event.action === 'request_edit') {
      return event.role === role || (role === 'dean' && ['pr', 'english'].includes(event.role)) || (role === 'english' && event.role === 'pr');
    }
    if (event.role === 'club' && event.action === 'resubmitted') {
      if (event.toStatus === 'pending_pr') return true;
      if (event.toStatus === 'pending_english') return ['english', 'dean'].includes(role);
    }
    return false;
  });
}

function getActiveComment(item) {
  if (item.status !== 'changes_requested') return null;
  const role = item.editRequestedBy || 'english';
  const history = Array.isArray(item.commentHistory) ? item.commentHistory.filter((entry) => entry.role === role) : [];
  if (history.length) {
    const latest = [...history].reverse().find((entry) => !entry.deletedAt);
    return latest?.text ? { role, text: latest.text } : null;
  }
  if (item.hiddenCommentRoles?.includes(role)) return null;
  const legacy = String(item.comments?.[role] || '').split('\n').filter(Boolean).at(-1);
  return legacy ? { role, text: legacy, legacy: true } : null;
}

function openDetails(item, context = 'pending') {
  if (!item) return;
  activeRequest = item;
  activeDetailContext = context;
  const statusContext = context === 'status';
  const canRestart = statusContext && ['pr', 'english'].includes(currentRole) && !['draft', 'changes_requested', ({ pr: 'pending_pr', english: 'pending_english' })[currentRole]].includes(item.status);
  const canReturn = currentRole === 'dean' && ['pending_dean', 'published'].includes(item.status);
  document.getElementById('dialogApproveBtn').hidden = statusContext;
  document.getElementById('dialogRejectBtn').hidden = statusContext;
  document.getElementById('requestChangesBtn').hidden = statusContext || !['pr', 'english'].includes(currentRole);
  document.getElementById('requestChangesBtn').textContent = 'Request Edit';
  document.getElementById('requestChangesBtn').dataset.dialogAction = 'request_edit';
  document.getElementById('reopenRequestBtn').hidden = !canRestart;
  document.getElementById('reopenRequestBtn').textContent = `Restart ${currentRole === 'pr' ? 'PR' : 'English'} Review`;
  const deleteRequestButton = document.getElementById('deleteRequestBtn');
  if (deleteRequestButton) {
    deleteRequestButton.hidden = currentRole !== 'dean' || item.status === 'deleted';
    deleteRequestButton.textContent = item.type === 'event' ? 'Delete Event' : 'Delete Feed';
  }
  const returnToPrButton = document.getElementById('returnToPrBtn');
  const returnToEnglishButton = document.getElementById('returnToEnglishBtn');
  if (returnToPrButton) { returnToPrButton.hidden = !canReturn; returnToPrButton.disabled = canReturn; }
  if (returnToEnglishButton) { returnToEnglishButton.hidden = !canReturn; returnToEnglishButton.disabled = canReturn; }
  document.getElementById('detailTitle').textContent = item.title || 'Untitled request';
  requestDetails.replaceChildren();
  addDetail('Club', item.clubName);
  addDetail('Type', item.type);
  addDetail('Date', item.date);
  addDetail('Time', item.time);
  addDetail('Location', item.location);
  addDetail('Budget', item.budget);
  addDetail('Status', formatStatus(item.status));
  addDetail('Description', item.description, true);

  const attachment = document.createElement('section');
  attachment.className = 'detail-item detail-wide';
  const heading = document.createElement('h3');
  heading.textContent = 'Attachments';
  attachment.append(heading);
  if (item.image) {
    const link = document.createElement('a');
    link.href = item.image;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Open attachment';
    const image = document.createElement('img');
    image.src = item.image;
    image.alt = 'Request attachment';
    image.className = 'detail-attachment';
    attachment.append(link, image);
  } else {
    const empty = document.createElement('p');
    empty.textContent = 'No attachments';
    attachment.append(empty);
  }
  requestDetails.append(attachment);

  const commentsSection = document.createElement('section');
  commentsSection.className = 'detail-item detail-wide comment-history';
  const commentsHeading = document.createElement('h3');
  commentsHeading.textContent = 'Comments';
  commentsSection.append(commentsHeading);
  const activeComment = getActiveComment(item);
  if (activeComment) {
    commentsHeading.textContent = 'Active comment';
    const entry = document.createElement('p');
    entry.style.cssText = 'display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:8px;white-space:pre-wrap';
    const author = document.createElement('strong');
    author.textContent = `${({ pr: 'PR Department', english: 'English Department', dean: 'Dean' })[activeComment.role] || 'Committee'}: `;
    const text = document.createElement('span');
    text.style.flex = '1';
    text.textContent = activeComment.text;
    entry.append(author, text);
    if (currentRole === activeComment.role) {
      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'mini-btn';
      deleteButton.textContent = 'Delete';
      deleteButton.style.cssText = 'flex:0 0 auto;padding:5px 10px;border:1px solid #c9222a;border-radius:999px;background:#fff;color:#a51c22;font-weight:700;cursor:pointer';
      deleteButton.addEventListener('click', () => deleteOwnComment(item));
      entry.append(deleteButton);
    }
    commentsSection.append(entry);
    requestDetails.append(commentsSection);
  }

  const addCommentSection = document.createElement('section');
  addCommentSection.className = 'detail-item detail-wide add-comment';
  const addCommentHeading = document.createElement('h3');
  addCommentHeading.textContent = currentRole === 'dean' && canReturn ? 'Note for the committee receiving this event' : 'Add your comment';
  const commentLabel = document.createElement('label');
  commentLabel.htmlFor = 'dialogComment';
  commentLabel.textContent = currentRole === 'dean' && canReturn ? 'Required note' : 'Comment';
  commentLabel.style.cssText = 'display:block;margin-top:12px;font-weight:700';
  const commentInput = document.createElement('textarea');
  commentInput.id = 'dialogComment';
  commentInput.rows = 3;
  commentInput.maxLength = 2000;
  commentInput.placeholder = currentRole === 'dean'
    ? 'Explain what PR or English needs to review. This note goes to that committee; the club only sees a return notification.'
    : 'Write a comment for the club';
  commentInput.style.cssText = 'width:100%;margin-top:6px;padding:10px 12px;border:1px solid #ddd;border-radius:12px;resize:vertical';
  commentInput.addEventListener('input', () => {
    for (const button of [returnToPrButton, returnToEnglishButton]) {
      if (button && canReturn) button.disabled = !commentInput.value.trim();
    }
  });
  const sendCommentButton = document.createElement('button');
  sendCommentButton.id = 'sendCommentBtn';
  sendCommentButton.type = 'button';
  sendCommentButton.className = 'secondary-btn';
  sendCommentButton.textContent = 'Send Comment';
  sendCommentButton.style.marginTop = '8px';
  sendCommentButton.hidden = statusContext && currentRole !== 'dean';
  sendCommentButton.addEventListener('click', () => act(item, 'comment', true));
  addCommentSection.hidden = statusContext && !canRestart && currentRole !== 'dean';
  addCommentSection.append(addCommentHeading, commentLabel, commentInput, sendCommentButton);
  requestDetails.append(addCommentSection);
  if (currentRole === 'dean') {
    const approvals = document.createElement('section');
    approvals.className = 'detail-item detail-wide';
    const approvalsHeading = document.createElement('h3');
    approvalsHeading.textContent = 'Committee approvals';
    approvals.append(approvalsHeading);
    for (const role of ['pr', 'english', 'dean']) {
      const approved = hasCurrentApproval(item, role);
      const line = document.createElement('p');
      line.textContent = `${({ pr: 'PR Department', english: 'English Department', dean: 'Dean' })[role]}: ${approved ? 'Approved' : 'Not approved yet'}`;
      approvals.append(line);
    }
    const timelineHeading = document.createElement('h3');
    timelineHeading.textContent = 'Timeline';
    approvals.append(timelineHeading);
    const timeline = Array.isArray(item.workflowHistory) ? [...item.workflowHistory].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) : [];
    if (!timeline.length) {
      const empty = document.createElement('p'); empty.textContent = 'No workflow history recorded yet.'; approvals.append(empty);
    }
    for (const event of timeline) {
      const line = document.createElement('p');
      const actor = ({ club: 'Club', pr: 'PR Department', english: 'English Department', dean: 'Dean' })[event.role] || event.role;
      const when = event.createdAt ? new Date(event.createdAt).toLocaleString() : '';
      line.textContent = `${when} · ${actor} ${String(event.action || '').replaceAll('_', ' ')}${event.comment ? `: ${event.comment}` : ''}`;
      approvals.append(line);
    }
    requestDetails.append(approvals);
  }
  requestDialog.showModal();
}

async function deleteOwnComment(item) {
  if (!confirm('Delete your comment from this request?')) return;
  try {
    const response = await fetch(`/api/committee/requests/${item.id}/comment`, { method: 'DELETE' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Could not delete comment.');
    requestDialog.close();
    if (activeDetailContext === 'status') {
      await loadStatusOverview();
      await loadStatusDetails(item.id);
      return;
    } else {
      await loadRequests();
      const refreshed = currentRequests.find((request) => Number(request.id) === Number(item.id));
      if (refreshed) openDetails(refreshed);
    }
  } catch (error) {
    alert(error.message);
  }
}

async function loadRequests() {
  try {
    const response = await fetch('/api/committee/requests');
    const items = await response.json();
    if (!response.ok) throw new Error(items.message || 'Could not load requests.');
    currentRequests = items;
    requestsList.replaceChildren();
    if (!items.length) {
      requestsList.textContent = 'No pending requests for your stage.';
      return;
    }
    for (const item of items) {
      const card = document.createElement('article');
      card.className = 'req-card';
      if (item.image) {
        const image = document.createElement('img');
        image.src = item.image;
        image.alt = '';
        card.append(image);
      }
      const summary = document.createElement('div');
      summary.style.flex = '1';
      const title = document.createElement('strong');
      title.textContent = item.title || 'Untitled request';
      const meta = document.createElement('div');
      meta.className = 'req-meta';
      meta.textContent = [item.clubName, item.type, item.date || 'no date', item.location].filter(Boolean).join(' · ');
      const actions = document.createElement('div');
      actions.className = 'req-actions';
      const comment = document.createElement('input');
      comment.placeholder = 'Comment (optional)';
      comment.dataset.comment = item.id;
      actions.append(comment);
      for (const [action, label, className] of [['approve', 'Approve', 'approve'], ['reject', 'Reject', 'reject']]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = className;
        button.textContent = label;
        button.addEventListener('click', () => act(item, action));
        actions.append(button);
      }
      if (['pr', 'english'].includes(currentRole)) {
        const editButton = document.createElement('button');
        editButton.type = 'button'; editButton.className = 'changes'; editButton.textContent = 'Request Edit';
        editButton.addEventListener('click', () => act(item, 'request_edit'));
        actions.append(editButton);
      }
      if (currentRole === 'dean' || currentRole === 'pr') {
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button'; deleteBtn.className = 'delete'; deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => {
          if (confirm('Are you sure you want to delete this event? It will be removed from the homepage and events page.')) {
            act(item, 'delete');
          }
        });
        actions.append(deleteBtn);
      }
      const viewButton = document.createElement('button');
      viewButton.type = 'button';
      viewButton.className = 'view-details';
      viewButton.setAttribute('aria-label', `View details for ${item.title || 'request'}`);
      viewButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg><span>View Details</span>';
      viewButton.addEventListener('click', () => openDetails(item));
      actions.append(viewButton);
      summary.append(title, meta);
      if (item.clubNotice) {
        const notice = document.createElement('div'); notice.className = 'status-overview-meta'; notice.textContent = item.clubNotice; summary.append(notice);
      }
      const returnAction = Array.isArray(item.workflowHistory)
        ? [...item.workflowHistory].reverse().find((event) => event.role === 'dean' && event.action === `returned_to_${currentRole}`)
        : null;
      if (returnAction?.comment) {
        const note = document.createElement('div');
        note.className = 'status-overview-meta';
        note.style.cssText = 'white-space:pre-wrap;color:#92400e';
        note.textContent = `Dean's note for ${currentRole === 'pr' ? 'PR' : 'English'}: ${returnAction.comment}`;
        summary.append(note);
      }
      summary.append(actions);
      card.append(summary);
      requestsList.append(card);
    }
  } catch (error) {
    requestsList.textContent = error.message;
  }
}

async function showStatusOverview() {
  if (!statusOverviewDialog || !statusOverviewList) return;
  statusOverviewMode = 'all';
  document.getElementById('statusOverviewTitle').textContent = 'All Events Status';
  statusOverviewList.textContent = 'Loading event statuses…';
  statusOverviewDialog.showModal();
  await loadStatusOverview();
}

async function showRestartOverview() {
  if (!statusOverviewDialog || !statusOverviewList) return;
  statusOverviewMode = 'restartable';
  document.getElementById('statusOverviewTitle').textContent = 'Restart Review';
  statusOverviewList.textContent = 'Loading events…';
  statusOverviewDialog.showModal();
  await loadStatusOverview();
}

async function loadStatusOverview() {
  if (!statusOverviewList) return;
  try {
    const response = await fetch('/api/committee/status', { cache: 'no-store' });
    let items = await response.json();
    if (!response.ok) throw new Error(items.message || 'Could not load event statuses.');
    if (statusOverviewMode === 'restartable') {
      items = items.filter((item) => !['draft', 'changes_requested', 'pending_english'].includes(item.status));
    }
    statusOverviewList.replaceChildren();
    if (!items.length) {
      statusOverviewList.textContent = statusOverviewMode === 'restartable' ? 'No events are available to restart right now.' : 'No requests yet.';
      return;
    }
    const labels = {
      draft: 'Draft',
      pending_pr: 'Waiting for PR',
      pending_english: 'Waiting for English',
      pending_dean: 'Waiting for Dean',
      changes_requested: 'Changes requested',
      rejected: 'Rejected',
      published: 'Published · Dean approved',
      deleted: 'Deleted'
    };
    const reviewStage = { pr: 'pending_pr', english: 'pending_english', dean: 'pending_dean' }[currentRole];
    for (const item of items) {
      const row = document.createElement('article');
      row.className = 'req-card';
      if (item.image) {
        const image = document.createElement('img');
        image.src = item.image;
        image.alt = '';
        row.append(image);
      }
      const details = document.createElement('div');
      details.style.flex = '1';
      const title = document.createElement('strong');
      title.textContent = item.title || 'Untitled request';
      const meta = document.createElement('div');
      meta.className = 'status-overview-meta';
      meta.textContent = [item.clubName, item.type, item.date, item.time].filter(Boolean).join(' · ');
      details.append(title, meta);
      const status = document.createElement('span');
      status.className = `status-overview-pill ${item.status || ''}`;
      status.textContent = labels[item.status] || formatStatus(item.status);
      details.append(status);
      if (item.clubNotice) {
        const notice = document.createElement('p'); notice.className = 'status-overview-meta'; notice.textContent = item.clubNotice; details.append(notice);
      }
      const activeComment = getActiveComment(item);
      if (activeComment) {
        const note = document.createElement('p');
        note.className = 'status-overview-meta';
        note.style.cssText = 'margin:7px 0 0;white-space:pre-wrap';
        note.textContent = `English Department: ${activeComment.text}`;
        details.append(note);
      }
      const actions = document.createElement('div');
      actions.className = 'req-actions';
      const canReview = item.status === reviewStage;
      const canRestart = ['pr', 'english'].includes(currentRole) && !['draft', 'changes_requested', ({ pr: 'pending_pr', english: 'pending_english' })[currentRole]].includes(item.status);
      if (canReview || canRestart) {
        const comment = document.createElement('input');
        comment.placeholder = 'Comment (optional)';
        comment.dataset.comment = item.id;
        actions.append(comment);
        if (canReview) {
          for (const [action, label, className] of [['approve', 'Approve', 'approve'], ['reject', 'Reject', 'reject']]) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = className;
            button.textContent = label;
            button.addEventListener('click', () => act(item, action, false, 'status'));
            actions.append(button);
          }
          if (['pr', 'english'].includes(currentRole)) {
            const editButton = document.createElement('button');
            editButton.type = 'button'; editButton.className = 'changes'; editButton.textContent = 'Request Edit';
            editButton.addEventListener('click', () => act(item, 'request_edit', false, 'status'));
            actions.append(editButton);
          }
        } else {
          const restartButton = document.createElement('button');
          restartButton.type = 'button';
          restartButton.className = 'reopen-review';
          restartButton.textContent = `Restart ${currentRole === 'pr' ? 'PR' : 'English'} Review`;
          restartButton.addEventListener('click', () => restartReview(item, comment.value, false, restartButton));
          actions.append(restartButton);
        }
      }
      const viewButton = document.createElement('button');
      viewButton.type = 'button';
      viewButton.className = 'view-details';
      viewButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg><span>View Details</span>';
      viewButton.addEventListener('click', () => loadStatusDetails(item.id));
      actions.append(viewButton);
      if (currentRole === 'dean') {
        const historyButton = document.createElement('button');
        historyButton.type = 'button';
        historyButton.className = 'view-details';
        historyButton.textContent = 'Review All Edits';
        historyButton.addEventListener('click', () => loadReviewHistory(item.id));
        actions.append(historyButton);
      }
      if (currentRole === 'dean' || currentRole === 'pr') {
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'delete';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => {
          if (confirm('Are you sure you want to delete this event? It will be removed from the homepage and events page.')) {
            fetch(`/api/committee/requests/${item.id}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'delete', comment: '' })
            }).then(async (res) => {
              const result = await res.json();
              if (!res.ok) throw new Error(result.message || 'Action failed');
              await loadRequests();
              if (statusOverviewMode === 'all') await loadStatusOverview('all');
              else if (statusOverviewMode === 'restartable') await loadStatusOverview('restartable');
            }).catch((error) => alert(error.message));
          }
        });
        actions.append(deleteBtn);
      }
      row.append(details, actions);
      statusOverviewList.append(row);
    }
  } catch (error) {
    statusOverviewList.textContent = error.message;
  }
}

function displayAction(action) {
  return ({
    submitted: 'Submitted the event',
    resubmitted: 'Resubmitted the event',
    approve: 'Approved the event',
    reject: 'Rejected the event',
    request_edit: 'Requested edits',
    restarted_review: 'Restarted review',
    returned_to_pr: 'Returned the event to PR review',
    returned_to_english: 'Returned the event to English review',
    comment: 'Added a comment',
    comment_deleted: 'Deleted a comment',
    deleted: 'Deleted the event or feed post'
  })[action] || String(action || 'Updated the event').replaceAll('_', ' ');
}

async function deleteDeanContent() {
  if (!activeRequest) return;
  const item = activeRequest;
  const itemLabel = item.type === 'event' ? 'event' : 'feed post';
  if (!confirm(`Delete this ${itemLabel}? It will be removed from the club feed, and its review history will be kept.`)) return;
  const button = document.getElementById('deleteRequestBtn');
  button.disabled = true;
  try {
    const response = await fetch(`/api/committee/requests/${item.id}`, { method: 'DELETE' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Could not delete this content.');
    requestDialog.close();
    activeRequest = null;
    await loadRequests();
    if (statusOverviewDialog?.open) await loadStatusOverview();
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
  }
}

function displayTimelineStatus(status) {
  return ({
    draft: 'Draft',
    pending_pr: 'Under PR Review',
    pending_english: 'Under English Review',
    pending_dean: 'Under Dean Review',
    changes_requested: 'Edit Requested',
    rejected: 'Rejected',
    published: 'Approved / Published'
  })[status] || (status ? String(status).replaceAll('_', ' ') : '—');
}

function focusCommitteeHistory(role) {
  const entries = [...reviewHistoryList.querySelectorAll('.review-history-entry')];
  const matches = entries.filter((entry) => entry.dataset.role === role);
  entries.forEach((entry) => entry.classList.toggle('focused-review', entry.dataset.role === role));
  matches[0]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function openHistoryReturn(role) {
  historyReturnTarget = role;
  focusCommitteeHistory(role);
  const targetName = role === 'pr' ? 'PR' : 'English';
  const panel = document.getElementById('historyReturnPanel');
  const available = ['pending_dean', 'published'].includes(activeReviewHistoryItem?.status);
  document.getElementById('historyReturnTitle').textContent = `Return event to ${targetName}`;
  document.getElementById('historyReturnHelp').textContent = available
    ? `Write the required note for ${targetName}. The committee will see it; the club will only be notified that the event was returned.`
    : 'The event can be returned after it reaches Dean review.';
  document.getElementById('historyReturnComment').value = '';
  document.getElementById('submitHistoryReturnBtn').textContent = `Send back to ${targetName}`;
  document.getElementById('submitHistoryReturnBtn').disabled = !available || !document.getElementById('historyReturnComment').value.trim();
  panel.hidden = false;
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderReviewHistory(item) {
  document.getElementById('reviewHistoryTitle').textContent = `Review All Edits · ${item.title || 'Untitled event'}`;
  reviewHistoryList.replaceChildren();
  let events = Array.isArray(item.workflowHistory) ? [...item.workflowHistory] : [];
  if (!events.length && item.submittedAt) {
    events.push({ role: 'club', actorRole: 'president', action: 'submitted', fromStatus: 'draft', toStatus: 'pending_pr', createdAt: item.submittedAt });
    for (const comment of item.commentHistory || []) {
      events.push({ role: comment.role, action: item.status === 'changes_requested' && comment.role === item.editRequestedBy ? 'request_edit' : 'comment', comment: comment.text, createdAt: comment.createdAt });
    }
    events.push({ role: 'system', action: `Current status: ${displayTimelineStatus(item.status)}`, createdAt: item.updatedAt || item.submittedAt });
  }
  events.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  if (!events.length) {
    const empty = document.createElement('p'); empty.textContent = 'No review history is recorded for this event yet.'; reviewHistoryList.append(empty); return;
  }
  const roles = { club: 'Club', pr: 'PR Committee', english: 'English Committee', dean: 'Religion Committee (Dean)', system: 'Workflow' };
  for (const event of events) {
    const actionKey = ['request_edit', 'returned_to_pr', 'returned_to_english'].includes(event.action) ? 'request_edit'
      : event.action === 'reject' ? 'reject'
        : event.action === 'deleted' ? 'reject'
        : event.action === 'resubmitted' ? 'resubmitted'
          : event.action === 'approve' ? 'approve' : 'comment';
    const entry = document.createElement('article'); entry.className = `review-history-entry ${actionKey}`; entry.dataset.role = event.role || '';
    const heading = document.createElement('h3');
    const role = roles[event.role] || event.role || 'Workflow';
    heading.textContent = `${role} ${displayAction(event.action)}`;
    let reviewLinks = null;
    if (event.action === 'approve') {
      const badge = document.createElement('span'); badge.className = 'review-history-badge'; badge.textContent = 'Done'; heading.append(badge);
      reviewLinks = document.createElement('div'); reviewLinks.className = 'review-committee-links';
      for (const [role, label] of [['pr', 'Review PR'], ['english', 'Review English']]) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
        button.disabled = !['pending_dean', 'published'].includes(item.status);
        button.title = button.disabled ? 'Available after the event reaches Dean review' : `Return the event to ${label.replace('Review ', '')} with a comment`;
        button.addEventListener('click', () => openHistoryReturn(role));
        reviewLinks.append(button);
      }
      heading.append(reviewLinks);
    } else {
      const badge = document.createElement('span'); badge.className = `review-history-badge ${actionKey}`;
      badge.textContent = event.action === 'request_edit' ? 'Request Edit' : event.action === 'returned_to_pr' ? 'Returned to PR' : event.action === 'returned_to_english' ? 'Returned to English' : event.action === 'reject' ? 'Rejected' : event.action === 'deleted' ? 'Deleted' : event.action === 'resubmitted' ? 'Resubmitted' : 'Comment'; heading.append(badge);
    }
    entry.append(heading);
    const status = document.createElement('p');
    status.textContent = `Status: ${displayTimelineStatus(event.fromStatus)} → ${displayTimelineStatus(event.toStatus)}`;
    entry.append(status);
    if (event.comment) {
      const comment = document.createElement('p'); comment.textContent = `Comment: ${event.comment}`; entry.append(comment);
    }
    const actor = document.createElement('p');
    actor.textContent = `User: ${event.actorEmail || (event.role === 'club' ? 'Club account (legacy record)' : `${role} (legacy record)`)}`;
    entry.append(actor);
    const moment = event.createdAt ? new Date(event.createdAt) : null;
    const date = document.createElement('p');
    date.textContent = `Date: ${moment && !Number.isNaN(moment.getTime()) ? moment.toLocaleDateString('en-GB') : 'Not recorded'}`;
    const time = document.createElement('p');
    time.textContent = `Time: ${moment && !Number.isNaN(moment.getTime()) ? moment.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'Not recorded'}`;
    entry.append(date, time);
    if (reviewLinks) entry.append(reviewLinks);
    reviewHistoryList.append(entry);
  }
}

async function loadReviewHistory(id) {
  if (!reviewHistoryDialog || !reviewHistoryList) return;
  reviewHistoryList.textContent = 'Loading review history…';
  document.getElementById('reviewHistoryTitle').textContent = 'Review All Edits';
  reviewHistoryDialog.showModal();
  try {
    const response = await fetch(`/api/committee/status/${id}`, { cache: 'no-store' });
    const item = await response.json();
    if (!response.ok) throw new Error(item.message || 'Could not load review history.');
    activeReviewHistoryItem = item;
    document.getElementById('historyReturnPanel').hidden = true;
    renderReviewHistory(item);
  } catch (error) {
    reviewHistoryList.textContent = error.message;
  }
}

async function submitHistoryReturn() {
  const item = activeReviewHistoryItem;
  const comment = document.getElementById('historyReturnComment')?.value.trim() || '';
  if (!item || !historyReturnTarget) return;
  if (!comment) {
    alert('Write why the event is being returned to the department.');
    return;
  }
  const button = document.getElementById('submitHistoryReturnBtn');
  button.disabled = true;
  try {
    const response = await fetch(`/api/committee/requests/${item.id}/return-to-committee`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: historyReturnTarget, comment })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Could not return the event.');
    reviewHistoryDialog.close();
    activeReviewHistoryItem = null;
    historyReturnTarget = '';
    await loadRequests();
    if (statusOverviewDialog?.open) await loadStatusOverview();
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
  }
}

async function loadStatusDetails(id) {
  try {
    const response = await fetch(`/api/committee/status/${id}`, { cache: 'no-store' });
    const item = await response.json();
    if (!response.ok) throw new Error(item.message || 'Could not load request details.');
    openDetails(item, 'status');
  } catch (error) {
    alert(error.message);
  }
}

async function restartReview(item = activeRequest, commentText = '', fromDialog = true, actionButton = null) {
  if (!item) return;
  const comment = fromDialog ? document.getElementById('dialogComment')?.value.trim() : commentText.trim();
  if (!comment) {
    alert('Add a comment before restarting review.');
    return;
  }
  const button = actionButton || document.getElementById('reopenRequestBtn');
  button.disabled = true;
  try {
    const response = await fetch(`/api/committee/requests/${item.id}/reopen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Could not restart review.');
    if (fromDialog) {
      requestDialog.close();
      activeRequest = null;
    }
    await loadRequests();
    await loadStatusOverview();
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
  }
}

async function returnToCommittee(targetRole, actionButton) {
  if (!activeRequest) return;
  const comment = document.getElementById('dialogComment')?.value.trim() || '';
  if (!comment) {
    alert('Add a comment explaining why the event is being returned.');
    return;
  }
  actionButton.disabled = true;
  try {
    const response = await fetch(`/api/committee/requests/${activeRequest.id}/return-to-committee`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: targetRole, comment })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Could not return the event.');
    requestDialog.close();
    activeRequest = null;
    await loadRequests();
    if (statusOverviewDialog?.open) await loadStatusOverview();
  } catch (error) {
    alert(error.message);
  } finally {
    actionButton.disabled = false;
  }
}

async function act(item, action, fromDialog = false, source = 'queue') {
  const list = source === 'status' ? statusOverviewList : requestsList;
  const card = list?.querySelector(`[data-comment="${item.id}"]`)?.closest('.req-card');
  const comment = fromDialog
    ? (document.getElementById('dialogComment')?.value || '')
    : (card?.querySelector(`[data-comment="${item.id}"]`)?.value || '');
  if (action === 'request_edit' && !comment.trim()) {
    alert('Add a comment explaining the edits required.');
    return;
  }
  const buttons = [...(card?.querySelectorAll('button') || []), ...(fromDialog ? requestDialog.querySelectorAll('[data-dialog-action], #sendCommentBtn') : [])];
  buttons.forEach((button) => { button.disabled = true; });
  try {
    const response = await fetch(`/api/committee/requests/${item.id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, comment })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Action failed.');
    if (fromDialog && action === 'comment') {
      requestDialog.close();
      if (source === 'status') {
        await loadStatusDetails(item.id);
        return;
      }
      await loadRequests();
      const refreshed = currentRequests.find((request) => Number(request.id) === Number(item.id));
      if (refreshed) openDetails(refreshed);
    } else if (fromDialog) {
      requestDialog.close();
      activeRequest = null;
      await loadRequests();
    } else {
      await loadRequests();
      if (source === 'status') await loadStatusOverview();
    }
  } catch (error) {
    alert(error.message);
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

document.getElementById('detailsCancelBtn').addEventListener('click', () => requestDialog.close());
requestDialog.querySelectorAll('[data-dialog-action]').forEach((button) => button.addEventListener('click', () => {
  if (activeRequest) act(activeRequest, button.dataset.dialogAction, true);
}));
document.getElementById('reopenRequestBtn')?.addEventListener('click', () => restartReview(activeRequest));
document.getElementById('returnToPrBtn')?.addEventListener('click', (event) => returnToCommittee('pr', event.currentTarget));
document.getElementById('returnToEnglishBtn')?.addEventListener('click', (event) => returnToCommittee('english', event.currentTarget));
document.getElementById('deleteRequestBtn')?.addEventListener('click', deleteDeanContent);
document.getElementById('openStatusOverviewBtn')?.addEventListener('click', () => currentRole === 'english' ? showRestartOverview() : showStatusOverview());
document.getElementById('closeStatusOverviewBtn')?.addEventListener('click', () => statusOverviewDialog?.close());
document.getElementById('closeReviewHistoryBtn')?.addEventListener('click', () => reviewHistoryDialog?.close());
document.getElementById('closeReviewHistoryXBtn')?.addEventListener('click', () => reviewHistoryDialog?.close());
document.getElementById('cancelHistoryReturnBtn')?.addEventListener('click', () => {
  document.getElementById('historyReturnPanel').hidden = true;
  historyReturnTarget = '';
});
document.getElementById('submitHistoryReturnBtn')?.addEventListener('click', submitHistoryReturn);
document.getElementById('historyReturnComment')?.addEventListener('input', (event) => {
  const canReturn = ['pending_dean', 'published'].includes(activeReviewHistoryItem?.status);
  document.getElementById('submitHistoryReturnBtn').disabled = !canReturn || !event.currentTarget.value.trim();
});
document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/club-auth/logout', { method: 'POST' });
  window.location.href = '/';
});

(async () => {
  if (await ensureSession()) await loadRequests();
})();
