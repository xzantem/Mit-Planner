const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const database = require("./database");
const googleCalendar = require("./google-calendar");

const port = Number(process.env.PORT || 3000);
const root = __dirname;
const sessionCookieName = "gatherly_session";
const sessionTtlMs = 1000 * 60 * 60 * 24 * 7;
const publicFiles = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/styles.css", "styles.css"],
  ["/app.js", "app.js"],
]);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": mimeTypes[".json"], "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function sendJsonWithHeaders(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": mimeTypes[".json"], "Cache-Control": "no-store", ...headers });
  res.end(JSON.stringify(body));
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").filter(Boolean).map((cookie) => {
    const [name, ...rest] = cookie.trim().split("=");
    return [name, decodeURIComponent(rest.join("="))];
  }));
}

function sessionCookie(token, maxAge = Math.floor(sessionTtlMs / 1000)) {
  return `${sessionCookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

async function currentSession(req) {
  const token = parseCookies(req)[sessionCookieName];
  if (!token) {
    return null;
  }
  return database.findSession(token);
}

async function requireSession(req, res) {
  const session = await currentSession(req);
  if (!session) {
    sendJson(res, 401, { error: "Authentication required" });
    return null;
  }
  return session;
}

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 32);
}

function isValidName(value) {
  return /^[\p{L}\p{N} _.-]{2,32}$/u.test(value);
}

function isValidPassword(value) {
  return typeof value === "string" && value.length >= 8 && value.length <= 128;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const candidate = hashPassword(password, salt).hash;
  return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(hash, "hex"));
}

async function createLoginSession(res, user) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + sessionTtlMs;
  await database.createSession(token, user.id, expiresAt);
  sendJsonWithHeaders(res, 200, { user: { name: user.name } }, { "Set-Cookie": sessionCookie(token) });
}

function isValidDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidTime(value) {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

function normalizeMeeting(input, users, currentUser) {
  const title = String(input.title || "").trim();
  const place = String(input.place || "").trim();
  const notes = String(input.notes || "").trim();
  const date = String(input.date || "");
  const endDate = String(input.endDate || input.date || "");
  const time = String(input.time || "");

  if (!title || !place || !isValidDate(date) || !isValidDate(endDate) || endDate < date || !isValidTime(time)) {
    return null;
  }

  const attendees = {};
  users.forEach((friend) => {
    if (friend === currentUser || Object.hasOwn(input.attendees || {}, friend)) {
      const status = input.attendees?.[friend];
      attendees[friend] = ["going", "maybe", "out", "not_declared"].includes(status) ? status : "not_declared";
    }
  });
  attendees[currentUser] = "going";

  return {
    id: crypto.randomUUID(),
    organizer: currentUser,
    importantDefault: Boolean(input.important),
    title: title.slice(0, 56),
    date,
    endDate,
    time,
    place: place.slice(0, 64),
    notes: notes.slice(0, 400),
    attendees,
  };
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function shouldSyncMeetingForUser(meeting, userId) {
  return hasOwn(meeting.attendees, userId) && meeting.attendees[userId] !== "out";
}

function redirect(res, location) {
  res.writeHead(302, { Location: location, "Cache-Control": "no-store" });
  res.end();
}

async function ensureGoogleConnection(userId, forceRefresh = false) {
  if (!googleCalendar.isConfigured()) {
    return null;
  }

  const connection = await database.getGoogleCalendarConnection(userId);
  if (!connection) {
    return null;
  }

  const needsRefresh = forceRefresh
    || !connection.access_token
    || connection.expires_at <= Date.now() + 60_000;

  if (!needsRefresh) {
    return connection;
  }

  if (!connection.refresh_token) {
    return connection;
  }

  const refreshed = await googleCalendar.refreshAccessToken(connection.refresh_token);
  const nextConnection = {
    userId,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token || connection.refresh_token,
    expiresAt: Date.now() + ((refreshed.expires_in || 3600) * 1000),
    scope: refreshed.scope || connection.scope,
    calendarId: connection.calendar_id || "primary",
  };

  await database.upsertGoogleCalendarConnection(nextConnection);
  return database.getGoogleCalendarConnection(userId);
}

async function withGoogleCalendar(userId, operation) {
  let connection = await ensureGoogleConnection(userId);
  if (!connection) {
    return null;
  }

  try {
    return await operation(connection);
  } catch (error) {
    if (error.status === 401 && connection.refresh_token) {
      connection = await ensureGoogleConnection(userId, true);
      if (!connection) {
        return null;
      }
      return operation(connection);
    }
    throw error;
  }
}

async function syncMeetingForUser(meeting, userId) {
  if (!googleCalendar.isConfigured()) {
    return;
  }

  const mapping = await database.getGoogleCalendarEventMapping(meeting.id, userId);
  const shouldExist = shouldSyncMeetingForUser(meeting, userId);

  if (!shouldExist) {
    if (!mapping) {
      return;
    }

    try {
      await withGoogleCalendar(userId, (connection) => {
        if (!connection) {
          return null;
        }
        return googleCalendar.calendarRequest(
          connection.access_token,
          "DELETE",
          `/calendars/${encodeURIComponent(mapping.calendar_id || "primary")}/events/${encodeURIComponent(mapping.event_id)}`,
        );
      });
    } catch (error) {
      if (error.status !== 404) {
        throw error;
      }
    }

    await database.deleteGoogleCalendarEventMapping(meeting.id, userId);
    return;
  }

  const payload = googleCalendar.eventPayload(meeting);

  await withGoogleCalendar(userId, async (connection) => {
    if (!connection) {
      return null;
    }

    const calendarId = connection.calendar_id || "primary";

    if (mapping) {
      try {
        const updated = await googleCalendar.calendarRequest(
          connection.access_token,
          "PUT",
          `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(mapping.event_id)}`,
          payload,
        );
        await database.upsertGoogleCalendarEventMapping(meeting.id, userId, calendarId, updated.id || mapping.event_id);
        return updated;
      } catch (error) {
        if (error.status !== 404) {
          throw error;
        }
      }
    }

    const created = await googleCalendar.calendarRequest(
      connection.access_token,
      "POST",
      `/calendars/${encodeURIComponent(calendarId)}/events`,
      payload,
    );
    await database.upsertGoogleCalendarEventMapping(meeting.id, userId, calendarId, created.id);
    return created;
  });
}

async function syncMeetingForUsers(meeting, userIds) {
  for (const userId of userIds) {
    try {
      await syncMeetingForUser(meeting, userId);
    } catch (error) {
      console.error(`Google Calendar sync failed for ${userId} on meeting ${meeting.id}`, error);
    }
  }
}

async function syncAllMeetingsForUser(userId) {
  const meetings = await database.listMeetings();
  for (const meeting of meetings) {
    try {
      await syncMeetingForUser(meeting, userId);
    } catch (error) {
      console.error(`Google Calendar backfill failed for ${userId} on meeting ${meeting.id}`, error);
    }
  }
}

async function deleteSyncedMeetingForUser(mapping) {
  try {
    await withGoogleCalendar(mapping.user_id, (connection) => {
      if (!connection) {
        return null;
      }
      return googleCalendar.calendarRequest(
        connection.access_token,
        "DELETE",
        `/calendars/${encodeURIComponent(mapping.calendar_id || "primary")}/events/${encodeURIComponent(mapping.event_id)}`,
      );
    });
  } catch (error) {
    if (error.status !== 404) {
      throw error;
    }
  }

  await database.deleteGoogleCalendarEventMapping(mapping.meeting_id, mapping.user_id);
}

async function handleApi(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = requestUrl.pathname;

  if (req.method === "GET" && pathname === "/api/session") {
    const session = await currentSession(req);
    sendJson(res, 200, { user: session ? { name: session.name } : null });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/register") {
    const body = await readJson(req);
    const name = normalizeName(body.name);
    if (!isValidName(name)) {
      sendJson(res, 400, { error: "Invalid name", code: "INVALID_NAME" });
      return true;
    }

    if (!isValidPassword(body.password)) {
      sendJson(res, 400, { error: "Invalid password", code: "INVALID_PASSWORD" });
      return true;
    }

    const { salt, hash } = hashPassword(body.password);
    const user = await database.createOrClaimUser(name, salt, hash);
    if (!user) {
      sendJson(res, 409, { error: "User already exists", code: "USER_EXISTS" });
      return true;
    }

    await createLoginSession(res, user);
    return true;
  }

  if (req.method === "POST" && pathname === "/api/login") {
    const body = await readJson(req);
    const user = await database.findUserByName(normalizeName(body.name));
    if (!user?.password_hash) {
      sendJson(res, 401, { error: "User not found", code: "USER_NOT_FOUND" });
      return true;
    }

    if (!verifyPassword(String(body.password || ""), user.password_salt, user.password_hash)) {
      sendJson(res, 401, { error: "Invalid password", code: "WRONG_PASSWORD" });
      return true;
    }

    await createLoginSession(res, user);
    return true;
  }

  if (req.method === "POST" && pathname === "/api/logout") {
    const token = parseCookies(req)[sessionCookieName];
    if (token) {
      await database.deleteSession(token);
    }
    sendJsonWithHeaders(res, 200, { ok: true }, { "Set-Cookie": sessionCookie("", 0) });
    return true;
  }

  if (req.method === "GET" && pathname === "/api/state") {
    const session = await requireSession(req, res);
    if (!session) return true;
    sendJson(res, 200, {
      currentUser: session.name,
      friends: await database.listUsers(),
      meetings: await database.listMeetings(),
      googleCalendar: {
        configured: googleCalendar.isConfigured(),
        ...(await database.getGoogleCalendarStatus(session.name)),
      },
    });
    return true;
  }

  if (req.method === "GET" && pathname === "/api/google-calendar/connect") {
    const session = await requireSession(req, res);
    if (!session) return true;

    if (!googleCalendar.isConfigured()) {
      sendJson(res, 503, { error: "Google Calendar is not configured on the server" });
      return true;
    }

    const state = crypto.randomBytes(24).toString("hex");
    await database.createGoogleOAuthState(state, session.name, Date.now() + 10 * 60 * 1000);
    redirect(res, googleCalendar.buildAuthUrl(state));
    return true;
  }

  if (req.method === "GET" && pathname === "/api/google-calendar/callback") {
    const session = await requireSession(req, res);
    if (!session) return true;

    const state = requestUrl.searchParams.get("state");
    const code = requestUrl.searchParams.get("code");
    if (!state || !code) {
      sendJson(res, 400, { error: "Missing OAuth callback parameters" });
      return true;
    }

    const savedState = await database.consumeGoogleOAuthState(state);
    if (!savedState || savedState.user_id !== session.name) {
      sendJson(res, 400, { error: "Invalid OAuth state" });
      return true;
    }

    const existingConnection = await database.getGoogleCalendarConnection(session.name);
    const tokens = await googleCalendar.exchangeCodeForTokens(code);
    await database.upsertGoogleCalendarConnection({
      userId: session.name,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || existingConnection?.refresh_token || null,
      expiresAt: Date.now() + ((tokens.expires_in || 3600) * 1000),
      scope: tokens.scope || googleCalendar.googleCalendarScope,
      calendarId: "primary",
    });

    await syncAllMeetingsForUser(session.name);
    redirect(res, "/");
    return true;
  }

  if (req.method === "POST" && pathname === "/api/google-calendar/disconnect") {
    const session = await requireSession(req, res);
    if (!session) return true;

    await database.deleteGoogleCalendarConnection(session.name);
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/meetings") {
    const session = await requireSession(req, res);
    if (!session) return true;

    const users = await database.listUsers();
    const meeting = normalizeMeeting(await readJson(req), users, session.name);
    if (!meeting) {
      sendJson(res, 400, { error: "Invalid meeting" });
      return true;
    }

    const savedMeeting = await database.createMeeting(meeting);
    await syncMeetingForUsers(savedMeeting, Object.keys(savedMeeting.attendees));
    sendJson(res, 201, savedMeeting);
    return true;
  }

  const rsvpMatch = pathname.match(/^\/api\/meetings\/([^/]+)\/rsvp$/);
  if (req.method === "PATCH" && rsvpMatch) {
    const session = await requireSession(req, res);
    if (!session) return true;

    const { status } = await readJson(req);
    if (!["going", "maybe", "out"].includes(status)) {
      sendJson(res, 400, { error: "Invalid RSVP" });
      return true;
    }

    const meeting = await database.updateRsvp(rsvpMatch[1], session.name, status);
    if (!meeting) {
      sendJson(res, 404, { error: "Meeting not found" });
      return true;
    }

    try {
      await syncMeetingForUser(meeting, session.name);
    } catch (error) {
      console.error(`Google Calendar sync failed for RSVP ${session.name} on meeting ${meeting.id}`, error);
    }

    sendJson(res, 200, meeting);
    return true;
  }

  const importanceMatch = pathname.match(/^\/api\/meetings\/([^/]+)\/importance$/);
  if (req.method === "PATCH" && importanceMatch) {
    const session = await requireSession(req, res);
    if (!session) return true;

    const { important } = await readJson(req);
    if (typeof important !== "boolean") {
      sendJson(res, 400, { error: "Invalid importance" });
      return true;
    }

    const meeting = await database.updateImportance(importanceMatch[1], session.name, important);
    if (!meeting) {
      sendJson(res, 404, { error: "Meeting not found" });
      return true;
    }

    sendJson(res, 200, meeting);
    return true;
  }

  const deleteMatch = pathname.match(/^\/api\/meetings\/([^/]+)$/);
  if (req.method === "DELETE" && deleteMatch) {
    const session = await requireSession(req, res);
    if (!session) return true;

    const meeting = await database.getMeeting(deleteMatch[1]);
    const mappings = await database.listGoogleCalendarEventMappingsForMeeting(deleteMatch[1]);
    const deleted = await database.deleteMeeting(deleteMatch[1], session.name);
    if (!deleted) {
      sendJson(res, 403, { error: "Only the organizer can delete this meeting" });
      return true;
    }

    for (const mapping of mappings) {
      try {
        await deleteSyncedMeetingForUser(mapping);
      } catch (error) {
        console.error(`Google Calendar delete sync failed for ${mapping.user_id} on meeting ${mapping.meeting_id}`, error);
      }
    }

    sendJson(res, 200, { ok: true });
    return true;
  }

  return false;
}

async function serveStatic(req, res) {
  const pathname = new URL(req.url, `http://${req.headers.host || "localhost"}`).pathname;
  const fileName = publicFiles.get(pathname);
  if (!fileName) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const filePath = path.join(root, fileName);
  const content = await fs.readFile(filePath);
  res.writeHead(200, {
    "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  res.end(content);
}

const server = http.createServer(async (req, res) => {
  try {
    if (await handleApi(req, res)) {
      return;
    }
    await serveStatic(req, res);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "Server error" });
  }
});

database.initializeDatabase().then(() => {
  server.listen(port, () => {
    console.log(`Gatherly Planner running at http://localhost:${port}`);
  });
}).catch((error) => {
  console.error("Could not initialize database", error);
  process.exit(1);
});
