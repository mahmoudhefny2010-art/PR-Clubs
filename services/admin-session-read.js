// Retry only read-only session validation after a transient SQL connection failure.
// Each retry still reads the current account and revocation version from the database.
async function readAdminSessionData(read, database) {
  try { return await read(); }
  catch (error) {
    const code = error?.code || error?.originalError?.code;
    if (!database.isSqlProvider || !['DATABASE_UNAVAILABLE', 'ESOCKET', 'ECONNCLOSED', 'ENOCONN', 'ETIMEOUT'].includes(code)) throw error;
    await database.connect();
    return read();
  }
}
module.exports = { readAdminSessionData };
