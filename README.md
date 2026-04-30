# Gatherly Planner

A small hosted calendar-planner for a friend group. It lets each person create or claim a profile, sign in, create shared meetings, set date/time/place/notes, and opt in, maybe, or opt out. The interface defaults to Polish and can be switched to English in the header. Meetings, users, sessions, and RSVPs are stored in a SQLite database.

## Run Locally

```powershell
npm install
npm start
```

Then open:

```text
http://localhost:3000
```

Meeting data is stored in `data/gatherly.sqlite` on the server, so every browser pointed at the same hosted server sees the same plans.

Sessions are stored in the database and sent to the browser as HttpOnly cookies.

## Hosting Notes

- Use Node 16.20 or newer.
- Set `PORT` if your host provides one, for example `PORT=8080 npm start`.

## Google Calendar Sync

Google Calendar sync is one-way: changes from Gatherly Planner are pushed to each connected user's Google Calendar. Google Calendar changes are not imported back into the planner.

To enable it, configure these environment variables on the machine hosting the app:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `APP_TIMEZONE` optional, defaults to `Europe/Warsaw`

For local development, a typical redirect URI is:

```text
http://localhost:3000/api/google-calendar/callback
```

After the variables are set and the server is restarted, users can connect or disconnect Google Calendar from the top bar. The planner will then:

- create Google Calendar events for synced meets,
- update them when RSVP state changes for that user,
- remove them when the user opts out or when the meet is deleted.
