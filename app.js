const friends = ["Pat", "Marta", "Leo", "Anika", "Tomek", "Julia"];
const themeKey = "gatherly-planner-theme-v1";
const languageKey = "gatherly-planner-language-v1";
const today = startOfDay(new Date());
let currentUser = null;
let currentTheme = localStorage.getItem(themeKey) || "light";
let currentLanguage = localStorage.getItem(languageKey) || "pl";
let state = { friends, meetings: [] };
let visibleMonth = new Date(today.getFullYear(), today.getMonth(), 1);
let selectedDate = toDateKey(today);
let selectedMeetingId = null;
let activeFilter = "all";

const els = {
  appShell: document.querySelector(".app-shell"),
  authScreen: document.querySelector("#authScreen"),
  authForm: document.querySelector("#authForm"),
  authName: document.querySelector("#authName"),
  authPassword: document.querySelector("#authPassword"),
  authError: document.querySelector("#authError"),
  currentMonthLabel: document.querySelector("#currentMonthLabel"),
  calendarGrid: document.querySelector("#calendarGrid"),
  meetingList: document.querySelector("#meetingList"),
  meetingDetail: document.querySelector("#meetingDetail"),
  previousMonth: document.querySelector("#previousMonth"),
  nextMonth: document.querySelector("#nextMonth"),
  todayButton: document.querySelector("#todayButton"),
  newMeetingButton: document.querySelector("#newMeetingButton"),
  quickCurrentWeekendButton: document.querySelector("#quickCurrentWeekendButton"),
  quickNextWeekendButton: document.querySelector("#quickNextWeekendButton"),
  meetingDialog: document.querySelector("#meetingDialog"),
  meetingForm: document.querySelector("#meetingForm"),
  closeDialogButton: document.querySelector("#closeDialogButton"),
  cancelDialogButton: document.querySelector("#cancelDialogButton"),
  friendInviteGrid: document.querySelector("#friendInviteGrid"),
  currentUserName: document.querySelector("#currentUserName"),
  logoutButton: document.querySelector("#logoutButton"),
  languageSelect: document.querySelector("#languageSelect"),
  googleCalendarButton: document.querySelector("#googleCalendarButton"),
  themeToggle: document.querySelector("#themeToggle"),
  themeIcon: document.querySelector("#themeIcon"),
  themeLabel: document.querySelector("#themeLabel"),
  currentWeekendAlert: document.querySelector("#currentWeekendAlert"),
  currentWeekendAlertText: document.querySelector("#currentWeekendAlertText"),
  nextWeekendAlert: document.querySelector("#nextWeekendAlert"),
  nextWeekendAlertText: document.querySelector("#nextWeekendAlertText"),
  upcomingCount: document.querySelector("#upcomingCount"),
  weekendCount: document.querySelector("#weekendCount"),
  optInCount: document.querySelector("#optInCount"),
};

const translations = {
  pl: {
    agenda: "Agenda",
    all: "Wszystkie",
    authEyebrow: "Prywatny planer",
    authLead: "Zaloguj się albo utwórz profil, aby zarządzać wspólnymi mitami.",
    brandEyebrow: "Kalendarz grupy znajomych",
    brandLede: "Planujcie weekendy, wybierajcie miejsca i trzymajcie RSVP w jednym miejscu zamiast w chaosie czatu.",
    browse: "Przeglądaj",
    cancel: "Anuluj",
    createMeeting: "Utwórz mita",
    createAccount: "Utwórz konto",
    createPlan: "Utwórz plan",
    currentWeekendGapTitle: "Brak mita w ten weekend",
    date: "Data",
    details: "Szczegóły",
    deleteMeeting: "Usuń mita",
    deleteMeetingConfirm: "Czy na pewno usunąć tego mita?",
    deleteMeetingFailed: "Nie udało się usunąć mita.",
    dark: "Ciemny",
    emptyAgendaText: "Utwórz mita albo wybierz inny dzień.",
    emptyAgendaTitle: "Nie ma tu jeszcze mitów.",
    going: "Idę",
    googleCalendar: "Google Calendar",
    connectGoogleCalendar: "Połącz Google Calendar",
    disconnectGoogleCalendar: "Odłącz Google Calendar",
    googleCalendarUnavailable: "Skonfiguruj Google Calendar",
    googleCalendarSetupHelp: "Google Calendar wymaga konfiguracji na serwerze: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET i GOOGLE_REDIRECT_URI.",
    inviteFriends: "Zaproś znajomych",
    invalidName: "Nazwa musi mieć od 2 do 32 znaków. Użyj liter, cyfr, spacji, kropki, myślnika albo podkreślenia.",
    invalidPassword: "Hasło musi mieć co najmniej 8 znaków.",
    language: "Język",
    light: "Jasny",
    loginFailed: "Nie udało się zalogować. Sprawdź nazwę i hasło.",
    logout: "Wyloguj",
    maybe: "Może",
    markImportant: "Oznacz jako ważny",
    important: "Ważny",
    importantForYou: "Ważne dla ciebie",
    markImportantForMe: "Oznacz jako ważny dla mnie",
    unmarkImportantForMe: "Nie jest ważny dla mnie",
    meetingTitle: "Tytuł spotkania",
    meetingTitlePlaceholder: "Planszówki, brunch, kino...",
    meetings: "Spotkania",
    newMeeting: "Nowe spotkanie",
    nextWeekendGapTitle: "Brak mita w następny weekend",
    noNotes: "Brak dodatkowych notatek.",
    notDeclared: "Nie zadeklarowano",
    notes: "Notatki",
    notesPlaceholder: "Co wszyscy powinni wiedzieć?",
    optedOut: "Nie idę",
    password: "Hasło",
    place: "Miejsce",
    placePlaceholder: "Kawiarnia, park, adres, czat głosowy...",
    planIt: "Zaplanuj",
    registerFailed: "Nie udało się utworzyć konta. Nazwa może być zajęta albo hasło jest za krótkie.",
    selectMeeting: "Wybierz mita",
    selectMeetingHelp: "Wybierz dzień w kalendarzu albo kartę mita, aby zobaczyć miejsce, status znajomych i opcje RSVP.",
    serverErrorText: "Uruchom serwer Node i odśwież stronę.",
    serverErrorTitle: "Nie udało się połączyć z serwerem planera.",
    signedInAs: "Zalogowano jako",
    signIn: "Zaloguj",
    startDate: "Data rozpoczęcia",
    endDate: "Data zakończenia",
    switchDark: "Przełącz na tryb ciemny",
    switchLight: "Przełącz na tryb jasny",
    time: "Godzina",
    undeclared: "Bez deklaracji",
    upcoming: "nadchodzące",
    userName: "Nazwa użytkownika",
    userExists: "Ta nazwa ma już ustawione hasło. Zaloguj się albo wybierz inną nazwę.",
    userNotFound: "Nie znaleziono takiego profilu. Utwórz konto, aby zacząć.",
    viewingAs: "Widok jako",
    weekendGapText: "Nikt nic nie zaplanował na {label}.",
    weekendGapTitle: "Brakuje planu na weekend",
    weekendPlans: "plany weekendowe",
    weekends: "Weekendy",
    when: "Kiedy",
    wrongPassword: "Hasło jest nieprawidłowe. Spróbuj ponownie.",
    yourOptIns: "twoje zapisy",
  },
  en: {
    agenda: "Agenda",
    all: "All",
    authEyebrow: "Private planner",
    authLead: "Sign in or create your profile to manage shared meetings.",
    brandEyebrow: "Friend group calendar",
    brandLede: "Plan weekends, pick places, and keep RSVPs visible without burying the group chat.",
    browse: "Browse",
    cancel: "Cancel",
    createMeeting: "Create meeting",
    createAccount: "Create account",
    createPlan: "Create plan",
    currentWeekendGapTitle: "No meet this weekend",
    date: "Date",
    details: "Details",
    deleteMeeting: "Delete meeting",
    deleteMeetingConfirm: "Delete this meeting?",
    deleteMeetingFailed: "Could not delete the meeting.",
    dark: "Dark",
    emptyAgendaText: "Create one or choose another day.",
    emptyAgendaTitle: "No meetings here yet.",
    going: "Going",
    googleCalendar: "Google Calendar",
    connectGoogleCalendar: "Connect Google Calendar",
    disconnectGoogleCalendar: "Disconnect Google Calendar",
    googleCalendarUnavailable: "Configure Google Calendar",
    googleCalendarSetupHelp: "Google Calendar needs server setup first: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.",
    inviteFriends: "Invite friends",
    invalidName: "Name must be 2 to 32 characters. Use letters, numbers, spaces, dot, dash, or underscore.",
    invalidPassword: "Password must be at least 8 characters.",
    language: "Language",
    light: "Light",
    loginFailed: "Could not sign in. Check the name and password.",
    logout: "Logout",
    maybe: "Maybe",
    markImportant: "Mark as important",
    important: "Important",
    importantForYou: "Important for you",
    markImportantForMe: "Mark important for me",
    unmarkImportantForMe: "Not important for me",
    meetingTitle: "Meeting title",
    meetingTitlePlaceholder: "Board games, brunch, cinema...",
    meetings: "Meetings",
    newMeeting: "New meeting",
    nextWeekendGapTitle: "No meet next weekend",
    noNotes: "No extra notes yet.",
    notDeclared: "Not declared",
    notes: "Notes",
    notesPlaceholder: "What should everyone know?",
    optedOut: "Opted out",
    password: "Password",
    place: "Place",
    placePlaceholder: "Cafe, park, address, voice chat...",
    planIt: "Plan it",
    registerFailed: "Could not create the account. The name may already be taken or the password is too short.",
    selectMeeting: "Select a meeting",
    selectMeetingHelp: "Choose a calendar day or meeting card to see the place, attendee status, and RSVP controls.",
    serverErrorText: "Start the Node server and reload this page.",
    serverErrorTitle: "Could not reach the planner server.",
    signedInAs: "Signed in as",
    signIn: "Sign in",
    startDate: "Start date",
    endDate: "End date",
    switchDark: "Switch to dark mode",
    switchLight: "Switch to light mode",
    time: "Time",
    undeclared: "Undeclared",
    upcoming: "upcoming",
    userName: "User name",
    userExists: "That name already has a password. Sign in or choose another name.",
    userNotFound: "No profile was found with that name. Create an account to get started.",
    viewingAs: "Viewing as",
    weekendGapText: "No one has planned anything for {label}.",
    weekendGapTitle: "Weekend gap coming up",
    weekendPlans: "weekend plans",
    weekends: "Weekends",
    when: "When",
    wrongPassword: "That password is incorrect. Try again.",
    yourOptIns: "your opt-ins",
  },
};

applyTheme(currentTheme);
applyLanguage(currentLanguage);

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const error = new Error(errorBody.error || `Request failed: ${response.status}`);
    error.code = errorBody.code;
    error.status = response.status;
    throw error;
  }

  return response.json();
}

async function loadState() {
  state = await api("/api/state");
  currentUser = state.currentUser;
  selectedMeetingId = state.meetings[0]?.id ?? null;
  showPlanner();
  render();
}

async function refreshState() {
  const nextState = await api("/api/state").catch((error) => {
    showAuth();
    throw error;
  });
  state = nextState;
  currentUser = state.currentUser;

  if (!state.meetings.some((meeting) => meeting.id === selectedMeetingId)) {
    selectedMeetingId = state.meetings[0]?.id ?? null;
  }

  render();
}

async function loadSession() {
  const session = await api("/api/session");
  if (session.user) {
    currentUser = session.user.name;
    await loadState();
    return;
  }

  showAuth();
  renderTranslations();
}

function showAuth() {
  currentUser = null;
  els.appShell.hidden = true;
  els.authScreen.hidden = false;
}

function showPlanner() {
  els.authScreen.hidden = true;
  els.appShell.hidden = false;
  els.currentUserName.textContent = currentUser;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function nextWeekday(fromDate, weekday, minimumDaysAway) {
  let candidate = addDays(fromDate, minimumDaysAway);
  while (candidate.getDay() !== weekday) {
    candidate = addDays(candidate, 1);
  }
  return candidate;
}

function parseDate(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatDate(dateKey, options) {
  return new Intl.DateTimeFormat(locale(), options).format(parseDate(dateKey));
}

function meetingEndDate(meeting) {
  return meeting.endDate || meeting.end_date || meeting.date;
}

function dateRangeOverlaps(startA, endA, startB, endB) {
  return startA <= endB && endA >= startB;
}

function meetingCoversDate(meeting, dateKey) {
  const day = parseDate(dateKey);
  return dateRangeOverlaps(parseDate(meeting.date), parseDate(meetingEndDate(meeting)), day, day);
}

function meetingOverlapsRange(meeting, startKey, endKey) {
  return dateRangeOverlaps(parseDate(meeting.date), parseDate(meetingEndDate(meeting)), parseDate(startKey), parseDate(endKey));
}

function meetingTouchesWeekend(meeting) {
  let cursor = parseDate(meeting.date);
  const end = parseDate(meetingEndDate(meeting));
  while (cursor <= end) {
    if ([0, 6].includes(cursor.getDay())) return true;
    cursor = addDays(cursor, 1);
  }
  return false;
}

function formatMeetingDateRange(meeting, options = { weekday: "long", month: "long", day: "numeric" }) {
  if (meetingEndDate(meeting) === meeting.date) {
    return formatDate(meeting.date, options);
  }
  return `${formatDate(meeting.date, options)} - ${formatDate(meetingEndDate(meeting), options)}`;
}

function sortedMeetings() {
  return [...state.meetings].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
}

function sortMeetingsForAgenda(meetings) {
  return [...meetings].sort((a, b) => {
    const importantDelta = Number(isImportantForCurrentUser(b)) - Number(isImportantForCurrentUser(a));
    if (importantDelta !== 0) {
      return importantDelta;
    }
    return `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`);
  });
}

function getFilteredMeetings() {
  return sortMeetingsForAgenda(sortedMeetings().filter((meeting) => {
    const isUpcoming = parseDate(meetingEndDate(meeting)) >= today;
    const isWeekend = meetingTouchesWeekend(meeting);
    const isSelectedDate = meetingCoversDate(meeting, selectedDate);

    if (activeFilter === "going") {
      return meeting.attendees[currentUser] === "going" && isUpcoming;
    }

    if (activeFilter === "undeclared") {
      return meeting.attendees[currentUser] === "not_declared" && isUpcoming;
    }

    if (activeFilter === "weekend") {
      return isWeekend && isUpcoming;
    }

    return isSelectedDate || isUpcoming;
  }));
}

function render() {
  renderTranslations();
  renderThemeToggle();
  renderGoogleCalendarButton();
  renderSummary();
  renderWeekendAlert();
  renderCalendar();
  renderMeetings();
  renderDetail();
}

function t(key, replacements = {}) {
  const template = translations[currentLanguage]?.[key] ?? translations.en[key] ?? key;
  return Object.entries(replacements).reduce((value, [name, replacement]) => {
    return value.replaceAll(`{${name}}`, replacement);
  }, template);
}

function locale() {
  return currentLanguage === "pl" ? "pl-PL" : "en";
}

function applyTheme(theme) {
  currentTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = currentTheme;
  localStorage.setItem(themeKey, currentTheme);
}

function applyLanguage(language) {
  currentLanguage = translations[language] ? language : "pl";
  document.documentElement.lang = currentLanguage;
  localStorage.setItem(languageKey, currentLanguage);
}

function renderThemeToggle() {
  const isDark = currentTheme === "dark";
  els.themeToggle.ariaLabel = isDark ? t("switchLight") : t("switchDark");
  els.themeLabel.textContent = isDark ? t("light") : t("dark");
  els.themeIcon.textContent = isDark ? "L" : "D";
}

function renderTranslations() {
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  });

  els.languageSelect.value = currentLanguage;
}

function renderGoogleCalendarButton() {
  const googleState = state.googleCalendar || { configured: false, connected: false };
  els.googleCalendarButton.textContent = googleState.configured
    ? (googleState.connected ? t("disconnectGoogleCalendar") : t("connectGoogleCalendar"))
    : t("googleCalendarUnavailable");
  els.googleCalendarButton.title = googleState.configured ? t("googleCalendar") : t("googleCalendarSetupHelp");
}

function authErrorMessage(error, mode) {
  const messages = {
    INVALID_NAME: "invalidName",
    INVALID_PASSWORD: "invalidPassword",
    USER_EXISTS: "userExists",
    USER_NOT_FOUND: "userNotFound",
    WRONG_PASSWORD: "wrongPassword",
  };
  const key = messages[error.code] || (mode === "register" ? "registerFailed" : "loginFailed");
  return t(key);
}

function renderSummary() {
  const upcoming = sortedMeetings().filter((meeting) => parseDate(meetingEndDate(meeting)) >= today);
  els.upcomingCount.textContent = upcoming.length;
  els.weekendCount.textContent = upcoming.filter((meeting) => meetingTouchesWeekend(meeting)).length;
  els.optInCount.textContent = upcoming.filter((meeting) => meeting.attendees[currentUser] === "going").length;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function isImportantForCurrentUser(meeting) {
  if (!meeting) return false;
  if (hasOwn(meeting.importance, currentUser)) {
    return Boolean(meeting.importance[currentUser]);
  }
  return Boolean(meeting.importantDefault);
}

function replaceMeeting(updated) {
  state.meetings = state.meetings.map((item) => item.id === updated.id ? updated : item);
}

function renderWeekendAlert() {
  const [currentWeekend, nextWeekend] = weekendGaps();
  renderWeekendGap(els.currentWeekendAlert, els.currentWeekendAlertText, els.quickCurrentWeekendButton, currentWeekend);
  renderWeekendGap(els.nextWeekendAlert, els.nextWeekendAlertText, els.quickNextWeekendButton, nextWeekend);
}

function renderWeekendGap(alertElement, textElement, buttonElement, weekend) {
  if (!weekend?.isGap) {
    alertElement.hidden = true;
    textElement.textContent = "";
    return;
  }

  alertElement.hidden = false;
  textElement.textContent = t("weekendGapText", { label: weekend.label });
  buttonElement.dataset.date = weekend.saturdayKey;
}

function weekendGaps() {
  const weekends = nextTwoWeekendWindows();
  return weekends.map((weekend) => {
    const hasMeeting = state.meetings.some((meeting) => {
      return meetingCoversDate(meeting, weekend.saturdayKey) || meetingCoversDate(meeting, weekend.sundayKey);
    });
    return { ...weekend, isGap: !hasMeeting };
  });
}

function nextTwoWeekendWindows() {
  const day = today.getDay();
  const firstSaturdayOffset = day === 0 ? -1 : day === 6 ? 0 : 6 - day;

  return [firstSaturdayOffset, firstSaturdayOffset + 7].map((offset) => {
    const saturday = addDays(today, offset);
    const sunday = addDays(saturday, 1);
    const saturdayKey = toDateKey(saturday);
    const sundayKey = toDateKey(sunday);
    return {
      saturdayKey,
      sundayKey,
      daysAway: Math.max(0, offset),
      label: `${formatDate(saturdayKey, { month: "short", day: "numeric" })} - ${formatDate(sundayKey, { month: "short", day: "numeric" })}`,
    };
  });
}

function renderCalendar() {
  els.currentMonthLabel.textContent = new Intl.DateTimeFormat(locale(), { month: "long", year: "numeric" }).format(visibleMonth);
  els.calendarGrid.replaceChildren();

  const weekdays = currentLanguage === "pl" ? ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Nd"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  weekdays.forEach((day) => {
    const weekday = document.createElement("div");
    weekday.className = "weekday";
    weekday.textContent = day;
    els.calendarGrid.append(weekday);
  });

  const start = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const firstMondayOffset = (start.getDay() + 6) % 7;
  const gridStart = addDays(start, -firstMondayOffset);

  for (let index = 0; index < 42; index += 1) {
    const date = addDays(gridStart, index);
    const dateKey = toDateKey(date);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "day-cell";
    button.textContent = date.getDate();
    button.ariaLabel = new Intl.DateTimeFormat(locale(), { weekday: "long", month: "long", day: "numeric" }).format(date);

    if (date.getMonth() !== visibleMonth.getMonth()) button.classList.add("is-muted");
    if (dateKey === toDateKey(today)) button.classList.add("is-today");
    if (dateKey === selectedDate) button.classList.add("is-selected");
    if ([0, 6].includes(date.getDay())) button.classList.add("is-weekend");
    if (state.meetings.some((meeting) => meetingCoversDate(meeting, dateKey))) button.classList.add("has-meeting");

    button.addEventListener("click", () => {
      selectedDate = dateKey;
      visibleMonth = new Date(date.getFullYear(), date.getMonth(), 1);
      selectedMeetingId = sortedMeetings().find((meeting) => meetingCoversDate(meeting, dateKey))?.id ?? selectedMeetingId;
      render();
    });

    els.calendarGrid.append(button);
  }
}

function renderMeetings() {
  const meetings = getFilteredMeetings();
  els.meetingList.replaceChildren();

  if (meetings.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-agenda";
    empty.innerHTML = `<div><strong>${t("emptyAgendaTitle")}</strong><p>${t("emptyAgendaText")}</p></div>`;
    els.meetingList.append(empty);
    return;
  }

  meetings.forEach((meeting) => {
    const card = document.createElement("button");
    const importantIcon = isImportantForCurrentUser(meeting)
      ? `<span class="important-icon" title="${t("important")}" aria-label="${t("important")}">!</span>`
      : "";
    card.type = "button";
    card.className = `meeting-card ${meeting.id === selectedMeetingId ? "active" : ""}`;
    card.dataset.meetingId = meeting.id;
    card.innerHTML = `
      <div class="date-tile">${formatDate(meeting.date, { day: "2-digit" })}<span>${formatDate(meeting.date, { month: "short" })}</span></div>
      <div class="meeting-main">
        <div class="meeting-title-row">
          <h3>${escapeHtml(meeting.title)}</h3>
          ${importantIcon}
        </div>
        <p>${formatMeetingDateRange(meeting, { month: "short", day: "numeric" })} &middot; ${meeting.time} &middot; ${escapeHtml(meeting.place)}</p>
      </div>
      <div class="status-pill ${statusClass(meeting.attendees[currentUser] || "not_declared")}">${statusLabel(meeting.attendees[currentUser] || "not_declared")}</div>
    `;
    card.addEventListener("click", () => {
      selectedMeetingId = meeting.id;
      selectedDate = meeting.date;
      visibleMonth = new Date(parseDate(meeting.date).getFullYear(), parseDate(meeting.date).getMonth(), 1);
      render();
    });
    els.meetingList.append(card);
  });
}

function renderDetail() {
  const meeting = state.meetings.find((item) => item.id === selectedMeetingId);

  if (!meeting) {
    els.meetingDetail.className = "empty-state";
    els.meetingDetail.innerHTML = `
      <p class="eyebrow">${t("details")}</p>
      <h2>${t("selectMeeting")}</h2>
      <p>${t("selectMeetingHelp")}</p>
    `;
    return;
  }

  const attendees = Object.entries(meeting.attendees).map(([friend, status]) => {
    return `
      <div class="attendee">
        <span class="attendee-name"><span class="avatar">${friend.slice(0, 1)}</span>${friend}</span>
        <span class="status-pill ${statusClass(status)}">${statusLabel(status)}</span>
      </div>
    `;
  }).join("");

  const isImportant = isImportantForCurrentUser(meeting);
  const importanceButtonText = isImportant ? t("unmarkImportantForMe") : t("markImportantForMe");
  const detailImportantIcon = isImportant
    ? `<span class="important-icon" title="${t("important")}" aria-label="${t("important")}">!</span>`
    : "";
  els.meetingDetail.className = "";
  const organizerActions = meeting.organizer === currentUser
    ? `<div class="organizer-actions"><button class="danger-action" type="button" id="deleteMeetingButton">${t("deleteMeeting")}</button></div>`
    : "";
  els.meetingDetail.innerHTML = `
    <p class="eyebrow">${t("details")}</p>
    <div class="detail-title-row">
      <h2>${escapeHtml(meeting.title)}</h2>
      ${detailImportantIcon}
    </div>
    <div class="detail-meta">
      <div><span>${t("when")}</span>${formatMeetingDateRange(meeting)} ${meeting.time}</div>
      <div><span>${t("place")}</span>${escapeHtml(meeting.place)}</div>
      <div><span>${t("notes")}</span>${escapeHtml(meeting.notes || t("noNotes"))}</div>
    </div>
    <div class="importance-row">
      <span>${t("importantForYou")}</span>
      <button class="${isImportant ? "active" : ""}" type="button" id="importanceButton" aria-pressed="${isImportant}">${importanceButtonText}</button>
    </div>
    <div class="rsvp-row" aria-label="Your RSVP">
      ${rsvpButton("going", meeting)}
      ${rsvpButton("maybe", meeting)}
      ${rsvpButton("out", meeting)}
    </div>
    ${organizerActions}
    <p class="eyebrow">${t("inviteFriends")}</p>
    <div class="attendee-list">${attendees}</div>
  `;

  els.meetingDetail.querySelectorAll("[data-rsvp]").forEach((button) => {
    button.addEventListener("click", () => {
      api(`/api/meetings/${meeting.id}/rsvp`, {
        method: "PATCH",
        body: JSON.stringify({ status: button.dataset.rsvp }),
      }).then((updated) => {
        replaceMeeting(updated);
        render();
      });
    });
  });

  const importanceButton = els.meetingDetail.querySelector("#importanceButton");
  if (importanceButton) {
    importanceButton.addEventListener("click", () => {
      api(`/api/meetings/${meeting.id}/importance`, {
        method: "PATCH",
        body: JSON.stringify({ important: !isImportantForCurrentUser(meeting) }),
      }).then((updated) => {
        replaceMeeting(updated);
        render();
      });
    });
  }

  const deleteButton = els.meetingDetail.querySelector("#deleteMeetingButton");
  if (deleteButton) {
    deleteButton.addEventListener("click", () => {
      if (!window.confirm(t("deleteMeetingConfirm"))) {
        return;
      }

      api(`/api/meetings/${meeting.id}`, { method: "DELETE" }).then(() => {
        state.meetings = state.meetings.filter((item) => item.id !== meeting.id);
        selectedMeetingId = state.meetings[0]?.id ?? null;
        render();
      }).catch(() => {
        window.alert(t("deleteMeetingFailed"));
      });
    });
  }
}

function rsvpButton(status, meeting) {
  const active = (meeting.attendees[currentUser] || "not_declared") === status ? "active" : "";
  return `<button type="button" class="${active}" data-rsvp="${status}">${statusLabel(status)}</button>`;
}

function statusClass(status) {
  if (status === "going") return "status-going";
  if (status === "out") return "status-out";
  if (status === "not_declared") return "status-not-declared";
  return "status-maybe";
}

function statusLabel(status) {
  if (status === "going") return t("going");
  if (status === "out") return t("optedOut");
  if (status === "not_declared") return t("notDeclared");
  return t("maybe");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function openMeetingDialog(prefillDate = selectedDate) {
  els.meetingForm.reset();
  document.querySelector("#meetingDate").value = prefillDate;
  document.querySelector("#meetingEndDate").value = prefillDate;
  document.querySelector("#meetingEndDate").min = prefillDate;
  document.querySelector("#meetingTime").value = "18:30";
  renderFriendInvites();
  els.meetingDialog.showModal();
  document.querySelector("#meetingTitle").focus();
}

function renderFriendInvites() {
  els.friendInviteGrid.replaceChildren();
  state.friends.filter((friend) => friend !== currentUser).forEach((friend) => {
    const label = document.createElement("label");
    label.innerHTML = `<input type="checkbox" name="friends" value="${friend}" ${friend === currentUser ? "checked" : ""}> ${friend}`;
    els.friendInviteGrid.append(label);
  });
}

els.themeToggle.addEventListener("click", () => {
  applyTheme(currentTheme === "dark" ? "light" : "dark");
  renderThemeToggle();
});

document.querySelector("#meetingDate").addEventListener("change", () => {
  const start = document.querySelector("#meetingDate").value;
  const end = document.querySelector("#meetingEndDate").value;
  if (!end || end < start) {
    document.querySelector("#meetingEndDate").value = start;
  }
  document.querySelector("#meetingEndDate").min = start;
});

els.authForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const submitter = event.submitter;
  const mode = submitter?.dataset.authMode || "login";
  els.authError.textContent = "";

  api(mode === "register" ? "/api/register" : "/api/login", {
    method: "POST",
    body: JSON.stringify({
      name: els.authName.value.trim(),
      password: els.authPassword.value,
    }),
  }).then((session) => {
    currentUser = session.user.name;
    els.authPassword.value = "";
    return loadState();
  }).catch((error) => {
    els.authError.textContent = authErrorMessage(error, mode);
  });
});

els.logoutButton.addEventListener("click", () => {
  api("/api/logout", { method: "POST", body: "{}" }).finally(() => {
    state = { friends, meetings: [], googleCalendar: { configured: false, connected: false } };
    selectedMeetingId = null;
    showAuth();
    renderTranslations();
  });
});

els.googleCalendarButton.addEventListener("click", () => {
  const googleState = state.googleCalendar || { configured: false, connected: false };
  if (!googleState.configured) {
    window.alert(t("googleCalendarSetupHelp"));
    return;
  }

  if (googleState.connected) {
    api("/api/google-calendar/disconnect", { method: "POST", body: "{}" }).then(() => {
      state.googleCalendar = { ...googleState, connected: false };
      renderGoogleCalendarButton();
    });
    return;
  }

  window.location.href = "/api/google-calendar/connect";
});

els.languageSelect.addEventListener("change", () => {
  applyLanguage(els.languageSelect.value);
  render();
});

els.previousMonth.addEventListener("click", () => {
  visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
  render();
});

els.nextMonth.addEventListener("click", () => {
  visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
  render();
});

els.todayButton.addEventListener("click", () => {
  visibleMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  selectedDate = toDateKey(today);
  render();
});

els.newMeetingButton.addEventListener("click", () => openMeetingDialog());
els.quickCurrentWeekendButton.addEventListener("click", () => openMeetingDialog(els.quickCurrentWeekendButton.dataset.date));
els.quickNextWeekendButton.addEventListener("click", () => openMeetingDialog(els.quickNextWeekendButton.dataset.date));
els.closeDialogButton.addEventListener("click", () => els.meetingDialog.close());
els.cancelDialogButton.addEventListener("click", () => els.meetingDialog.close());

document.querySelectorAll(".filter-chip").forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll(".filter-chip").forEach((chip) => chip.classList.toggle("active", chip === button));
    renderMeetings();
  });
});

els.meetingForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(els.meetingForm);
  const invited = new Set(form.getAll("friends"));
  const attendees = Object.fromEntries([...invited].map((friend) => [friend, "not_declared"]));
  attendees[currentUser] = "going";

  const meeting = {
    title: form.get("title").trim(),
    date: form.get("date"),
    endDate: form.get("endDate"),
    time: form.get("time"),
    place: form.get("place").trim(),
    notes: form.get("notes").trim(),
    important: form.get("important") === "on",
    attendees,
  };

  api("/api/meetings", {
    method: "POST",
    body: JSON.stringify(meeting),
  }).then((saved) => {
    state.meetings.push(saved);
    selectedMeetingId = saved.id;
    selectedDate = saved.date;
    visibleMonth = new Date(parseDate(saved.date).getFullYear(), parseDate(saved.date).getMonth(), 1);
    els.meetingDialog.close();
    render();
  });
});

loadSession().catch(() => {
  showAuth();
  renderTranslations();
  els.meetingList.innerHTML = `<div class="empty-agenda"><div><strong>${t("serverErrorTitle")}</strong><p>${t("serverErrorText")}</p></div></div>`;
});

setInterval(() => {
  if (!currentUser) return;
  refreshState().catch(() => {});
}, 15000);
