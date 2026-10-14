// Both providers must build identical runtime caches from the same documents.
function cacheSnapshot({ clubRecords, applicationRecords, accountRecords }, toApiRecord) {
  return {
    clubs: clubRecords.map((record, index) => ({
      ...toApiRecord(record),
      sortOrder: Number.isFinite(Number(record.sortOrder)) ? Number(record.sortOrder) : index + 1,
      pinned: record.pinned === true && record.status === 'open'
    })),
    applications: applicationRecords,
    clubAccounts: accountRecords.map(account => ({
      ...toApiRecord(account),
      role: ['head', 'pr', 'english', 'security', 'sso', 'dean', 'supervisor', 'miu_events', 'software_development'].includes(account.role) ? account.role : 'president',
      committee: account.committee || ''
    }))
  };
}
module.exports = { cacheSnapshot };
