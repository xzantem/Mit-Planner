const fs = require("node:fs/promises");
const path = require("node:path");
const sqlite3 = require("sqlite3").verbose();

const dataDir = path.join(__dirname, "data");
const databaseFile = path.join(dataDir, "gatherly.sqlite");
const statuses = new Set(["going", "maybe", "out", "not_declared"]);

let db;

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }
      resolve(this);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(rows);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(row);
    });
  });
}

async function connect() {
  await fs.mkdir(dataDir, { recursive: true });

  db = await new Promise((resolve, reject) => {
    const connection = new sqlite3.Database(databaseFile, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(connection);
    });
  });

  await run("PRAGMA foreign_keys = ON");
}

async function migrate() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      password_salt TEXT,
      password_hash TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await addColumnIfMissing("users", "password_salt", "TEXT");
  await addColumnIfMissing("users", "password_hash", "TEXT");

  await run(`
    CREATE TABLE IF NOT EXISTS meetings (
      id TEXT PRIMARY KEY,
      organizer_id TEXT,
      important_default INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      end_date TEXT,
      time TEXT NOT NULL,
      place TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await addColumnIfMissing("meetings", "organizer_id", "TEXT");
  await addColumnIfMissing("meetings", "important_default", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing("meetings", "end_date", "TEXT");
  await run("UPDATE meetings SET end_date = date WHERE end_date IS NULL OR end_date = ''");

  await run(`
    CREATE TABLE IF NOT EXISTS meeting_rsvps (
      meeting_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('going', 'maybe', 'out', 'not_declared')),
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (meeting_id, user_id),
      FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await migrateRsvpStatuses();

  await run(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS meeting_importance (
      meeting_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      is_important INTEGER NOT NULL CHECK (is_important IN (0, 1)),
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (meeting_id, user_id),
      FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS google_calendar_connections (
      user_id TEXT PRIMARY KEY,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expires_at INTEGER NOT NULL,
      scope TEXT,
      calendar_id TEXT NOT NULL DEFAULT 'primary',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await addColumnIfMissing("google_calendar_connections", "refresh_token", "TEXT");
  await addColumnIfMissing("google_calendar_connections", "scope", "TEXT");
  await addColumnIfMissing("google_calendar_connections", "calendar_id", "TEXT NOT NULL DEFAULT 'primary'");

  await run(`
    CREATE TABLE IF NOT EXISTS google_oauth_states (
      state TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await run("DELETE FROM google_oauth_states WHERE expires_at < ?", [Date.now()]);

  await run(`
    CREATE TABLE IF NOT EXISTS google_calendar_events (
      meeting_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      calendar_id TEXT NOT NULL DEFAULT 'primary',
      event_id TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (meeting_id, user_id),
      FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
}

async function addColumnIfMissing(table, column, definition) {
  const columns = await all(`PRAGMA table_info(${table})`);
  if (!columns.some((item) => item.name === column)) {
    await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

async function migrateRsvpStatuses() {
  const table = await get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'meeting_rsvps'");
  if (!table?.sql || table.sql.includes("not_declared")) {
    return;
  }

  await run("PRAGMA foreign_keys = OFF");
  await run("BEGIN IMMEDIATE TRANSACTION");
  try {
    await run("ALTER TABLE meeting_rsvps RENAME TO meeting_rsvps_old");
    await run(`
      CREATE TABLE meeting_rsvps (
        meeting_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('going', 'maybe', 'out', 'not_declared')),
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (meeting_id, user_id),
        FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    await run(`
      INSERT INTO meeting_rsvps (meeting_id, user_id, status, updated_at)
      SELECT meeting_id, user_id, status, updated_at
      FROM meeting_rsvps_old
    `);
    await run("DROP TABLE meeting_rsvps_old");
    await run("COMMIT");
  } catch (error) {
    await run("ROLLBACK");
    throw error;
  } finally {
    await run("PRAGMA foreign_keys = ON");
  }
}

async function initializeDatabase() {
  await connect();
  await migrate();
}

async function listUsers() {
  const rows = await all("SELECT name FROM users ORDER BY name");
  return rows.map((row) => row.name);
}

async function findUserByName(name) {
  return get("SELECT id, name, password_salt, password_hash FROM users WHERE lower(name) = lower(?)", [name]);
}

async function findUserById(id) {
  return get("SELECT id, name, password_salt, password_hash FROM users WHERE id = ?", [id]);
}

async function createOrClaimUser(name, passwordSalt, passwordHash) {
  const existing = await findUserByName(name);
  if (existing?.password_hash) {
    return null;
  }

  if (existing) {
    await run(
      "UPDATE users SET password_salt = ?, password_hash = ? WHERE id = ?",
      [passwordSalt, passwordHash, existing.id],
    );
    await ensureUserRsvps(existing.id);
    return findUserById(existing.id);
  }

  await run(
    "INSERT INTO users (id, name, password_salt, password_hash) VALUES (?, ?, ?, ?)",
    [name, name, passwordSalt, passwordHash],
  );
  await ensureUserRsvps(name);
  return findUserByName(name);
}

async function ensureUserRsvps(userId) {
  await run(`
    INSERT OR IGNORE INTO meeting_rsvps (meeting_id, user_id, status)
    SELECT id, ?, 'not_declared'
    FROM meetings
    WHERE organizer_id = ?
  `, [userId, userId]);
}

async function createSession(token, userId, expiresAt) {
  await run("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)", [token, userId, expiresAt]);
}

async function findSession(token) {
  const session = await get(`
    SELECT sessions.token, sessions.expires_at, users.id AS user_id, users.name
    FROM sessions
    INNER JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ?
  `, [token]);

  if (!session || session.expires_at < Date.now()) {
    if (session) {
      await deleteSession(token);
    }
    return null;
  }

  return session;
}

async function deleteSession(token) {
  await run("DELETE FROM sessions WHERE token = ?", [token]);
}

async function listMeetings() {
  const rows = await all(`
    SELECT
      meetings.id,
      meetings.organizer_id,
      meetings.important_default,
      meetings.title,
      meetings.date,
      COALESCE(meetings.end_date, meetings.date) AS end_date,
      meetings.time,
      meetings.place,
      meetings.notes,
      users.name AS attendee,
      meeting_rsvps.status,
      importance_users.name AS importance_user,
      meeting_importance.is_important
    FROM meetings
    LEFT JOIN meeting_rsvps ON meeting_rsvps.meeting_id = meetings.id
    LEFT JOIN users ON users.id = meeting_rsvps.user_id
    LEFT JOIN meeting_importance ON meeting_importance.meeting_id = meetings.id
    LEFT JOIN users AS importance_users ON importance_users.id = meeting_importance.user_id
    ORDER BY meetings.date, meetings.time, users.name, importance_users.name
  `);

  const byId = new Map();
  rows.forEach((row) => {
    if (!byId.has(row.id)) {
      byId.set(row.id, {
        id: row.id,
        organizer: row.organizer_id,
        importantDefault: Boolean(row.important_default),
        title: row.title,
        date: row.date,
        endDate: row.end_date,
        time: row.time,
        place: row.place,
        notes: row.notes,
        attendees: {},
        importance: {},
      });
    }

    if (row.attendee) {
      byId.get(row.id).attendees[row.attendee] = row.status;
    }

    if (row.importance_user) {
      byId.get(row.id).importance[row.importance_user] = Boolean(row.is_important);
    }
  });

  return [...byId.values()];
}

async function getMeeting(id) {
  return (await listMeetings()).find((meeting) => meeting.id === id);
}

async function createMeeting(meeting) {
  await run("BEGIN IMMEDIATE TRANSACTION");

  try {
    await run(
      "INSERT INTO meetings (id, organizer_id, important_default, title, date, end_date, time, place, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [meeting.id, meeting.organizer, meeting.importantDefault ? 1 : 0, meeting.title, meeting.date, meeting.endDate || meeting.date, meeting.time, meeting.place, meeting.notes || ""],
    );

    for (const [user, rawStatus] of Object.entries(meeting.attendees || {})) {
      const status = statuses.has(rawStatus) ? rawStatus : "not_declared";
      await run(
        "INSERT INTO meeting_rsvps (meeting_id, user_id, status) VALUES (?, ?, ?)",
        [meeting.id, user, status],
      );
    }

    await run("COMMIT");
  } catch (error) {
    await run("ROLLBACK");
    throw error;
  }

  return getMeeting(meeting.id);
}

async function updateImportance(meetingId, userId, isImportant) {
  const meeting = await get("SELECT id FROM meetings WHERE id = ?", [meetingId]);
  const user = await get("SELECT id FROM users WHERE id = ?", [userId]);
  if (!meeting || !user) {
    return null;
  }

  await run(
    `
      INSERT INTO meeting_importance (meeting_id, user_id, is_important, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(meeting_id, user_id)
      DO UPDATE SET is_important = excluded.is_important, updated_at = CURRENT_TIMESTAMP
    `,
    [meetingId, userId, isImportant ? 1 : 0],
  );

  return getMeeting(meetingId);
}

async function deleteMeeting(meetingId, organizerId) {
  const result = await run("DELETE FROM meetings WHERE id = ? AND organizer_id = ?", [meetingId, organizerId]);
  return result.changes > 0;
}

async function updateRsvp(meetingId, userId, status) {
  if (!statuses.has(status)) {
    return null;
  }

  const meeting = await get("SELECT id FROM meetings WHERE id = ?", [meetingId]);
  const user = await get("SELECT id FROM users WHERE id = ?", [userId]);
  if (!meeting || !user) {
    return null;
  }

  await run(
    `
      INSERT INTO meeting_rsvps (meeting_id, user_id, status, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(meeting_id, user_id)
      DO UPDATE SET status = excluded.status, updated_at = CURRENT_TIMESTAMP
    `,
    [meetingId, userId, status],
  );

  return getMeeting(meetingId);
}

async function createGoogleOAuthState(state, userId, expiresAt) {
  await run(
    "INSERT INTO google_oauth_states (state, user_id, expires_at) VALUES (?, ?, ?)",
    [state, userId, expiresAt],
  );
}

async function consumeGoogleOAuthState(state) {
  const row = await get("SELECT state, user_id, expires_at FROM google_oauth_states WHERE state = ?", [state]);
  if (!row) {
    return null;
  }

  await run("DELETE FROM google_oauth_states WHERE state = ?", [state]);
  if (row.expires_at < Date.now()) {
    return null;
  }

  return row;
}

async function getGoogleCalendarConnection(userId) {
  return get(`
    SELECT user_id, access_token, refresh_token, expires_at, scope, calendar_id
    FROM google_calendar_connections
    WHERE user_id = ?
  `, [userId]);
}

async function upsertGoogleCalendarConnection(connection) {
  await run(
    `
      INSERT INTO google_calendar_connections (
        user_id,
        access_token,
        refresh_token,
        expires_at,
        scope,
        calendar_id,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = COALESCE(excluded.refresh_token, google_calendar_connections.refresh_token),
        expires_at = excluded.expires_at,
        scope = excluded.scope,
        calendar_id = excluded.calendar_id,
        updated_at = CURRENT_TIMESTAMP
    `,
    [
      connection.userId,
      connection.accessToken,
      connection.refreshToken || null,
      connection.expiresAt,
      connection.scope || null,
      connection.calendarId || "primary",
    ],
  );
}

async function deleteGoogleCalendarConnection(userId) {
  await run("DELETE FROM google_calendar_connections WHERE user_id = ?", [userId]);
}

async function getGoogleCalendarStatus(userId) {
  const row = await get("SELECT 1 AS connected FROM google_calendar_connections WHERE user_id = ?", [userId]);
  return { connected: Boolean(row) };
}

async function getGoogleCalendarEventMapping(meetingId, userId) {
  return get(`
    SELECT meeting_id, user_id, calendar_id, event_id
    FROM google_calendar_events
    WHERE meeting_id = ? AND user_id = ?
  `, [meetingId, userId]);
}

async function upsertGoogleCalendarEventMapping(meetingId, userId, calendarId, eventId) {
  await run(
    `
      INSERT INTO google_calendar_events (meeting_id, user_id, calendar_id, event_id, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(meeting_id, user_id) DO UPDATE SET
        calendar_id = excluded.calendar_id,
        event_id = excluded.event_id,
        updated_at = CURRENT_TIMESTAMP
    `,
    [meetingId, userId, calendarId || "primary", eventId],
  );
}

async function deleteGoogleCalendarEventMapping(meetingId, userId) {
  await run("DELETE FROM google_calendar_events WHERE meeting_id = ? AND user_id = ?", [meetingId, userId]);
}

async function listGoogleCalendarEventMappingsForMeeting(meetingId) {
  return all(`
    SELECT meeting_id, user_id, calendar_id, event_id
    FROM google_calendar_events
    WHERE meeting_id = ?
  `, [meetingId]);
}

module.exports = {
  createOrClaimUser,
  createSession,
  deleteSession,
  findSession,
  findUserByName,
  initializeDatabase,
  listMeetings,
  listUsers,
  createMeeting,
  deleteMeeting,
  updateRsvp,
  updateImportance,
  createGoogleOAuthState,
  consumeGoogleOAuthState,
  getGoogleCalendarConnection,
  upsertGoogleCalendarConnection,
  deleteGoogleCalendarConnection,
  getGoogleCalendarStatus,
  getGoogleCalendarEventMapping,
  upsertGoogleCalendarEventMapping,
  deleteGoogleCalendarEventMapping,
  listGoogleCalendarEventMappingsForMeeting,
  getMeeting,
};
