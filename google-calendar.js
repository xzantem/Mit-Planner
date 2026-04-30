const https = require("node:https");

const googleAuthBaseUrl = "https://accounts.google.com/o/oauth2/v2/auth";
const googleTokenUrl = "https://oauth2.googleapis.com/token";
const googleCalendarApiBaseUrl = "https://www.googleapis.com/calendar/v3";
const googleCalendarScope = "https://www.googleapis.com/auth/calendar.events";
const appTimeZone = process.env.APP_TIMEZONE || "Europe/Warsaw";

function isConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
}

function request(method, urlString, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const req = https.request(
      url,
      {
        method,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const rawBody = Buffer.concat(chunks).toString("utf8");
          const contentType = res.headers["content-type"] || "";
          const parsedBody = contentType.includes("application/json") && rawBody
            ? JSON.parse(rawBody)
            : rawBody;

          if ((res.statusCode || 500) >= 400) {
            const error = new Error(typeof parsedBody === "string" ? parsedBody : parsedBody?.error_description || parsedBody?.error || "Google request failed");
            error.status = res.statusCode || 500;
            error.body = parsedBody;
            reject(error);
            return;
          }

          resolve(parsedBody);
        });
      },
    );

    req.on("error", reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function buildAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: googleCalendarScope,
    state,
  });

  return `${googleAuthBaseUrl}?${params.toString()}`;
}

function exchangeCodeForTokens(code) {
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    grant_type: "authorization_code",
  }).toString();

  return request(
    "POST",
    googleTokenUrl,
    {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(body),
    },
    body,
  );
}

function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  }).toString();

  return request(
    "POST",
    googleTokenUrl,
    {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(body),
    },
    body,
  );
}

function formatLocalDateTime(dateKey, time) {
  return `${dateKey}T${time}:00`;
}

function meetingEndDate(meeting) {
  return meeting.endDate || meeting.end_date || meeting.date;
}

function nextDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const next = new Date(year, month - 1, day);
  next.setDate(next.getDate() + 1);
  return [
    next.getFullYear(),
    String(next.getMonth() + 1).padStart(2, "0"),
    String(next.getDate()).padStart(2, "0"),
  ].join("-");
}

function eventPayload(meeting) {
  const endDate = meetingEndDate(meeting);
  const isMultiDay = endDate !== meeting.date;
  const endDateTime = isMultiDay
    ? formatLocalDateTime(nextDateKey(endDate), meeting.time)
    : (() => {
      const [hours, minutes] = meeting.time.split(":").map(Number);
      const end = new Date(`${meeting.date}T${meeting.time}:00`);
      end.setHours((hours || 0) + 2, minutes || 0, 0, 0);
      const localDate = [
        end.getFullYear(),
        String(end.getMonth() + 1).padStart(2, "0"),
        String(end.getDate()).padStart(2, "0"),
      ].join("-");
      const localTime = [
        String(end.getHours()).padStart(2, "0"),
        String(end.getMinutes()).padStart(2, "0"),
      ].join(":");
      return formatLocalDateTime(localDate, localTime);
    })();

  const descriptionParts = [];
  if (meeting.notes) {
    descriptionParts.push(meeting.notes);
  }
  descriptionParts.push("Synced from Gatherly Planner");

  return {
    summary: meeting.title,
    location: meeting.place,
    description: descriptionParts.join("\n\n"),
    start: {
      dateTime: formatLocalDateTime(meeting.date, meeting.time),
      timeZone: appTimeZone,
    },
    end: {
      dateTime: endDateTime,
      timeZone: appTimeZone,
    },
    extendedProperties: {
      private: {
        gatherlyMeetingId: meeting.id,
      },
    },
  };
}

function calendarRequest(accessToken, method, path, body = null, query = null) {
  const url = new URL(`${googleCalendarApiBaseUrl}${path}`);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    });
  }

  const serializedBody = body ? JSON.stringify(body) : null;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
  };

  if (serializedBody) {
    headers["Content-Type"] = "application/json";
    headers["Content-Length"] = Buffer.byteLength(serializedBody);
  }

  return request(method, url.toString(), headers, serializedBody);
}

module.exports = {
  buildAuthUrl,
  calendarRequest,
  eventPayload,
  exchangeCodeForTokens,
  googleCalendarScope,
  isConfigured,
  refreshAccessToken,
};
