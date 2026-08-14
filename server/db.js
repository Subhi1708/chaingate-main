// server/db.js
// SQLite database — creates all tables on first run

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || './data/chaingate.db';

// Make sure data directory exists
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for concurrent reads
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ────────────────────────────────────────────────────────────────────

db.exec(`
  -- Students registered by admin
  CREATE TABLE IF NOT EXISTS students (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    roll_no     TEXT    NOT NULL UNIQUE,
    name        TEXT    NOT NULL,
    department  TEXT    NOT NULL,
    year        TEXT,
    phone       TEXT,
    photo_data  TEXT,                        -- base64 reference photo (from admin)
    active      INTEGER NOT NULL DEFAULT 1,  -- 1=active, 0=suspended
    created_at  INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
  );

  -- QR tokens issued by mobile app (each single-use, 15s expiry)
  CREATE TABLE IF NOT EXISTS qr_tokens (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    token       TEXT    NOT NULL UNIQUE,
    student_id  TEXT    NOT NULL,
    name        TEXT    NOT NULL,
    department  TEXT,
    type        TEXT    NOT NULL CHECK(type IN ('entry','exit')),
    issued_at   INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
    expiry      INTEGER NOT NULL,            -- epoch ms
    used        INTEGER NOT NULL DEFAULT 0,  -- 1=already scanned
    used_at     INTEGER,
    FOREIGN KEY (student_id) REFERENCES students(roll_no)
  );

  -- Every gate event goes here (blockchain log)
  CREATE TABLE IF NOT EXISTS access_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    type        TEXT    NOT NULL,            -- GATE_OPEN, ACCESS_DENIED, etc.
    student_id  TEXT,
    name        TEXT,
    department  TEXT,
    msg         TEXT,
    tx_id       TEXT,                        -- blockchain transaction hash
    block_hash  TEXT,
    ts          INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
  );

  -- Blockchain blocks
  CREATE TABLE IF NOT EXISTS blocks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    block_index   INTEGER NOT NULL UNIQUE,
    previous_hash TEXT    NOT NULL,
    hash          TEXT    NOT NULL,
    nonce         INTEGER NOT NULL DEFAULT 0,
    data          TEXT    NOT NULL,          -- JSON
    ts            INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
  );

  -- Emergency passes issued by admin
  CREATE TABLE IF NOT EXISTS emergency_passes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    pass_id     TEXT    NOT NULL UNIQUE,
    student_id  TEXT    NOT NULL,
    reason      TEXT    NOT NULL,
    issued_by   TEXT    NOT NULL DEFAULT 'admin',
    expiry      INTEGER NOT NULL,
    used        INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
  );

  -- Face verification audit (every check logged)
  CREATE TABLE IF NOT EXISTS face_checks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id  TEXT    NOT NULL,
    matched     INTEGER NOT NULL,            -- 1=pass, 0=fail
    confidence  INTEGER,
    reason      TEXT,
    method      TEXT    NOT NULL DEFAULT 'claude_vision',
    check_type  TEXT    NOT NULL DEFAULT 'initial',  -- initial | continuous
    ts          INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
  );
`);

// ── Helper wrappers ───────────────────────────────────────────────────────────

const students = {
  findByRollNo: db.prepare('SELECT * FROM students WHERE roll_no = ?'),
  findAll: db.prepare('SELECT * FROM students ORDER BY created_at DESC'),
  insert: db.prepare(`
    INSERT INTO students (roll_no, name, department, year, phone, photo_data)
    VALUES (@roll_no, @name, @department, @year, @phone, @photo_data)
  `),
  updatePhoto: db.prepare('UPDATE students SET photo_data = ? WHERE roll_no = ?'),
  setActive: db.prepare('UPDATE students SET active = ? WHERE roll_no = ?'),
  delete: db.prepare('DELETE FROM students WHERE roll_no = ?'),
  search: db.prepare(`
    SELECT * FROM students
    WHERE name LIKE ? OR roll_no LIKE ? OR department LIKE ?
    ORDER BY name
  `),
};

const qrTokens = {
  insert: db.prepare(`
    INSERT INTO qr_tokens (token, student_id, name, department, type, expiry)
    VALUES (@token, @student_id, @name, @department, @type, @expiry)
  `),
  findByToken: db.prepare('SELECT * FROM qr_tokens WHERE token = ?'),
  markUsed: db.prepare('UPDATE qr_tokens SET used = 1, used_at = ? WHERE token = ?'),
  countTodayByStudent: db.prepare(`
    SELECT COUNT(*) as cnt FROM qr_tokens
    WHERE student_id = ? AND type = ? AND date(issued_at/1000,'unixepoch') = date('now')
  `),
};

const accessLog = {
  insert: db.prepare(`
    INSERT INTO access_log (type, student_id, name, department, msg, tx_id, block_hash)
    VALUES (@type, @student_id, @name, @department, @msg, @tx_id, @block_hash)
  `),
  recent: db.prepare('SELECT * FROM access_log ORDER BY ts DESC LIMIT ?'),
  byStudent: db.prepare('SELECT * FROM access_log WHERE student_id = ? ORDER BY ts DESC LIMIT 50'),
  todayStats: db.prepare(`
    SELECT
      COUNT(CASE WHEN type='GATE_OPEN' THEN 1 END) as entries,
      COUNT(CASE WHEN type='ACCESS_DENIED' THEN 1 END) as denied,
      COUNT(CASE WHEN type='FACE_MISMATCH' THEN 1 END) as mismatches
    FROM access_log
    WHERE date(ts/1000,'unixepoch') = date('now')
  `),
};

const blocks = {
  last: db.prepare('SELECT * FROM blocks ORDER BY block_index DESC LIMIT 1'),
  all: db.prepare('SELECT * FROM blocks ORDER BY block_index ASC'),
  insert: db.prepare(`
    INSERT INTO blocks (block_index, previous_hash, hash, nonce, data)
    VALUES (@block_index, @previous_hash, @hash, @nonce, @data)
  `),
  count: db.prepare('SELECT COUNT(*) as cnt FROM blocks'),
};

const emergencyPasses = {
  insert: db.prepare(`
    INSERT INTO emergency_passes (pass_id, student_id, reason, expiry)
    VALUES (@pass_id, @student_id, @reason, @expiry)
  `),
  findActive: db.prepare(`
    SELECT * FROM emergency_passes
    WHERE used = 0 AND expiry > (unixepoch('now') * 1000)
    ORDER BY created_at DESC
  `),
  markUsed: db.prepare('UPDATE emergency_passes SET used = 1 WHERE pass_id = ?'),
};

const faceChecks = {
  insert: db.prepare(`
    INSERT INTO face_checks (student_id, matched, confidence, reason, method, check_type)
    VALUES (@student_id, @matched, @confidence, @reason, @method, @check_type)
  `),
  recentFails: db.prepare(`
    SELECT * FROM face_checks WHERE matched = 0 ORDER BY ts DESC LIMIT 20
  `),
};

module.exports = { db, students, qrTokens, accessLog, blocks, emergencyPasses, faceChecks };