const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

let db;

async function initDB() {
  db = await open({
    filename: path.join(__dirname, 'claims.db'),
    driver: sqlite3.Database
  });
  await db.exec(`
    CREATE TABLE IF NOT EXISTS claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT NOT NULL,
      ticketCode TEXT UNIQUE NOT NULL,
      betting TEXT,
      scatter TEXT,
      status TEXT DEFAULT 'PENDING',
      remark TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  return db;
}

async function saveClaim(claim) {
  const { userId, ticketCode, betting, scatter, status, remark } = claim;
  try {
    await db.run(
      `INSERT INTO claims (userId, ticketCode, betting, scatter, status, remark) VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, ticketCode, betting, scatter, status || 'PENDING', remark || '']
    );
  } catch (e) {
    if (e.message.includes('UNIQUE constraint')) throw new Error('Kode tiket sudah ada');
    throw e;
  }
}

async function updateClaimStatus(ticketCode, status, remark = '') {
  await db.run(`UPDATE claims SET status = ?, remark = ?, updatedAt = CURRENT_TIMESTAMP WHERE ticketCode = ?`, [status, remark, ticketCode]);
}

async function getAllClaims() {
  return await db.all(`SELECT * FROM claims ORDER BY createdAt DESC`);
}

async function getPendingClaims() {
  return await db.all(`SELECT * FROM claims WHERE status = 'PENDING'`);
}

async function getClaimByTicket(ticketCode) {
  return await db.get(`SELECT * FROM claims WHERE ticketCode = ?`, ticketCode);
}

module.exports = { initDB, saveClaim, updateClaimStatus, getAllClaims, getPendingClaims, getClaimByTicket };