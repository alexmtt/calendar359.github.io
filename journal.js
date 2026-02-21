const ACCOUNT_KEY = "shift-journal-account-v1";
const SESSION_KEY = "shift-journal-session-v1";
const DATA_PREFIX = "shift-journal-data-v1";

const DEFAULT_SETTINGS = {
  baseShiftHours: 12,
  extraShiftHours: 4,
};

const registerBlock = document.getElementById("registerBlock");
const loginBlock = document.getElementById("loginBlock");
const authPanel = document.getElementById("authPanel");
const workspacePanel = document.getElementById("workspacePanel");
const registerForm = document.getElementById("registerForm");
const loginForm = document.getElementById("loginForm");
const registerName = document.getElementById("registerName");
const registerPin = document.getElementById("registerPin");
const registerPinRepeat = document.getElementById("registerPinRepeat");
const loginName = document.getElementById("loginName");
const loginPin = document.getElementById("loginPin");
const loginHint = document.getElementById("loginHint");
const authError = document.getElementById("authError");
const profileName = document.getElementById("profileName");
const logoutBtn = document.getElementById("logoutBtn");
const deleteAccountBtn = document.getElementById("deleteAccountBtn");
const journalMonthInput = document.getElementById("journalMonth");
const currentMonthBtn = document.getElementById("currentMonthBtn");
const baseShiftHoursInput = document.getElementById("baseShiftHours");
const extraShiftHoursInput = document.getElementById("extraShiftHours");
const monthRegularShiftCount = document.getElementById("monthRegularShiftCount");
const monthExtraShiftCount = document.getElementById("monthExtraShiftCount");
const monthTotalHours = document.getElementById("monthTotalHours");
const allTimeTotalHours = document.getElementById("allTimeTotalHours");
const workedDayCount = document.getElementById("workedDayCount");
const updatedAtLabel = document.getElementById("updatedAtLabel");
const selectedDateLabel = document.getElementById("selectedDateLabel");
const selectedRegularShiftCount = document.getElementById("selectedRegularShiftCount");
const selectedExtraShiftCount = document.getElementById("selectedExtraShiftCount");
const saveDayBtn = document.getElementById("saveDayBtn");
const clearDayBtn = document.getElementById("clearDayBtn");
const journalCalendar = document.getElementById("journalCalendar");
const journalStatus = document.getElementById("journalStatus");

const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const monthNames = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

let account = null;
let journalData = {
  settings: { ...DEFAULT_SETTINGS },
  entries: {},
  updatedAt: null,
};
let selectedDateKey = null;

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatMonthValue(year, monthIndex) {
  return `${year}-${pad2(monthIndex + 1)}`;
}

function formatDateKey(year, monthIndex, day) {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

function parseMonthValue(value) {
  if (!value) {
    return null;
  }

  const [yearPart, monthPart] = value.split("-").map(Number);
  if (!yearPart || !monthPart || monthPart < 1 || monthPart > 12) {
    return null;
  }

  return { year: yearPart, monthIndex: monthPart - 1 };
}

function dateKeyToParts(key) {
  const [yearPart, monthPart, dayPart] = String(key).split("-").map(Number);
  if (!yearPart || !monthPart || !dayPart) {
    return null;
  }

  return { year: yearPart, monthIndex: monthPart - 1, day: dayPart };
}

function formatSelectedDate(parts) {
  return `${parts.day} ${monthNames[parts.monthIndex]} ${parts.year}`;
}

function normalizeShiftCount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }

  return Math.floor(numeric);
}

function normalizeHours(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 24) {
    return fallback;
  }

  return Number(numeric.toFixed(2));
}

function normalizeDayEntry(rawEntry) {
  if (typeof rawEntry === "number") {
    return {
      regular: normalizeShiftCount(rawEntry),
      extra: 0,
    };
  }

  if (!rawEntry || typeof rawEntry !== "object") {
    return { regular: 0, extra: 0 };
  }

  return {
    regular: normalizeShiftCount(rawEntry.regular),
    extra: normalizeShiftCount(rawEntry.extra),
  };
}

function sanitizeEntries(rawEntries) {
  if (!rawEntries || typeof rawEntries !== "object") {
    return {};
  }

  const result = {};

  Object.entries(rawEntries).forEach(([dateKey, rawEntry]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      return;
    }

    const normalized = normalizeDayEntry(rawEntry);
    if (normalized.regular <= 0 && normalized.extra <= 0) {
      return;
    }

    result[dateKey] = normalized;
  });

  return result;
}

function normalizeJournalData(rawData) {
  const source = rawData && typeof rawData === "object" ? rawData : {};
  const sourceSettings = source.settings && typeof source.settings === "object" ? source.settings : {};

  return {
    settings: {
      baseShiftHours: normalizeHours(sourceSettings.baseShiftHours, DEFAULT_SETTINGS.baseShiftHours),
      extraShiftHours: normalizeHours(sourceSettings.extraShiftHours, DEFAULT_SETTINGS.extraShiftHours),
    },
    entries: sanitizeEntries(source.entries),
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : null,
  };
}

function setAuthError(message) {
  if (!message) {
    authError.textContent = "";
    authError.classList.add("hidden");
    return;
  }

  authError.textContent = message;
  authError.classList.remove("hidden");
}

function setStatus(message, type = "") {
  journalStatus.textContent = message || "";
  journalStatus.className = "status";
  if (type) {
    journalStatus.classList.add(type);
  }
}

function getAccountFromStorage() {
  const raw = localStorage.getItem(ACCOUNT_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed.username || !parsed.pinHash || !parsed.salt) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function saveAccountToStorage(nextAccount) {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(nextAccount));
}

function removeAccountFromStorage() {
  localStorage.removeItem(ACCOUNT_KEY);
}

function getDataStorageKey(username) {
  return `${DATA_PREFIX}:${username}`;
}

function getJournalDataFromStorage(username) {
  const raw = localStorage.getItem(getDataStorageKey(username));
  if (!raw) {
    return normalizeJournalData(null);
  }

  try {
    const parsed = JSON.parse(raw);
    return normalizeJournalData(parsed);
  } catch {
    return normalizeJournalData(null);
  }
}

function saveJournalDataToStorage() {
  if (!account) {
    return;
  }

  localStorage.setItem(getDataStorageKey(account.username), JSON.stringify(journalData));
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

function activateSession(username) {
  sessionStorage.setItem(SESSION_KEY, username);
}

function hasActiveSession(currentAccount) {
  return sessionStorage.getItem(SESSION_KEY) === currentAccount.username;
}

function getDaysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function getFirstWeekdayIndex(year, monthIndex) {
  const sundayBased = new Date(year, monthIndex, 1).getDay();
  return (sundayBased + 6) % 7;
}

function getTodayParts() {
  const now = new Date();
  return {
    year: now.getFullYear(),
    monthIndex: now.getMonth(),
    day: now.getDate(),
  };
}

function getDefaultSelectedDateKey(monthParts) {
  const today = getTodayParts();
  if (today.year === monthParts.year && today.monthIndex === monthParts.monthIndex) {
    return formatDateKey(monthParts.year, monthParts.monthIndex, today.day);
  }

  return formatDateKey(monthParts.year, monthParts.monthIndex, 1);
}

function ensureSelectedDate(monthParts) {
  const current = dateKeyToParts(selectedDateKey || "");
  if (
    current
    && current.year === monthParts.year
    && current.monthIndex === monthParts.monthIndex
  ) {
    return;
  }

  selectedDateKey = getDefaultSelectedDateKey(monthParts);
}

function getDayEntryByKey(dateKey) {
  return normalizeDayEntry(journalData.entries[dateKey]);
}

function setDayEntryByKey(dateKey, regular, extra) {
  const nextEntry = {
    regular: normalizeShiftCount(regular),
    extra: normalizeShiftCount(extra),
  };

  if (nextEntry.regular === 0 && nextEntry.extra === 0) {
    delete journalData.entries[dateKey];
    return;
  }

  journalData.entries[dateKey] = nextEntry;
}

function getMonthSummary(monthParts) {
  const daysInMonth = getDaysInMonth(monthParts.year, monthParts.monthIndex);
  let regularCount = 0;
  let extraCount = 0;
  let workedDays = 0;

  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = formatDateKey(monthParts.year, monthParts.monthIndex, day);
    const entry = getDayEntryByKey(key);
    regularCount += entry.regular;
    extraCount += entry.extra;
    if (entry.regular + entry.extra > 0) {
      workedDays += 1;
    }
  }

  const regularHours = regularCount * journalData.settings.baseShiftHours;
  const extraHours = extraCount * journalData.settings.extraShiftHours;

  return {
    regularCount,
    extraCount,
    workedDays,
    regularHours,
    extraHours,
    totalHours: regularHours + extraHours,
  };
}

function getAllTimeSummary() {
  let regularCount = 0;
  let extraCount = 0;

  Object.values(journalData.entries).forEach((rawEntry) => {
    const entry = normalizeDayEntry(rawEntry);
    regularCount += entry.regular;
    extraCount += entry.extra;
  });

  const regularHours = regularCount * journalData.settings.baseShiftHours;
  const extraHours = extraCount * journalData.settings.extraShiftHours;

  return {
    regularCount,
    extraCount,
    totalHours: regularHours + extraHours,
  };
}

function formatUpdateDate(value) {
  if (!value) {
    return "-";
  }

  try {
    return new Date(value).toLocaleString("ru-RU", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "-";
  }
}

function syncSettingsInputs() {
  baseShiftHoursInput.value = String(journalData.settings.baseShiftHours);
  extraShiftHoursInput.value = String(journalData.settings.extraShiftHours);
}

function syncSelectedDayInputs() {
  const selectedParts = dateKeyToParts(selectedDateKey || "");
  if (!selectedParts) {
    selectedDateLabel.textContent = "Выберите день в календаре";
    selectedRegularShiftCount.value = "0";
    selectedExtraShiftCount.value = "0";
    return;
  }

  const entry = getDayEntryByKey(selectedDateKey);
  selectedDateLabel.textContent = `Дата: ${formatSelectedDate(selectedParts)}`;
  selectedRegularShiftCount.value = String(entry.regular);
  selectedExtraShiftCount.value = String(entry.extra);
}

function renderSummary(monthParts) {
  const monthSummary = getMonthSummary(monthParts);
  const allTimeSummary = getAllTimeSummary();

  monthRegularShiftCount.textContent = formatNumber(monthSummary.regularCount);
  monthExtraShiftCount.textContent = formatNumber(monthSummary.extraCount);
  monthTotalHours.textContent = `${formatNumber(monthSummary.totalHours)} ч`;
  allTimeTotalHours.textContent = `${formatNumber(allTimeSummary.totalHours)} ч`;
  workedDayCount.textContent = formatNumber(monthSummary.workedDays);
  updatedAtLabel.textContent = formatUpdateDate(journalData.updatedAt);
}

function getCalendarDayClass(entry) {
  if (entry.regular > 0 && entry.extra > 0) {
    return "mixed-day";
  }

  if (entry.regular === 0 && entry.extra > 0) {
    return "extra-only";
  }

  if (entry.regular > 0) {
    return `reg-lvl-${Math.min(entry.regular, 4)}`;
  }

  return "";
}

function getDayHours(entry) {
  return (entry.regular * journalData.settings.baseShiftHours) + (entry.extra * journalData.settings.extraShiftHours);
}

function getDayLabel(entry) {
  if (entry.regular === 0 && entry.extra === 0) {
    return "—";
  }

  const parts = [];
  if (entry.regular > 0) {
    parts.push(`осн ${entry.regular}`);
  }
  if (entry.extra > 0) {
    parts.push(`доп ${entry.extra}`);
  }

  return parts.join(" • ");
}

function renderCalendar() {
  const monthParts = parseMonthValue(journalMonthInput.value);
  if (!monthParts) {
    return;
  }

  ensureSelectedDate(monthParts);
  syncSettingsInputs();
  syncSelectedDayInputs();

  const daysInMonth = getDaysInMonth(monthParts.year, monthParts.monthIndex);
  const firstWeekdayIndex = getFirstWeekdayIndex(monthParts.year, monthParts.monthIndex);
  const today = getTodayParts();
  const todayKey = formatDateKey(today.year, today.monthIndex, today.day);

  journalCalendar.innerHTML = "";

  weekdays.forEach((weekday) => {
    const weekdayCell = document.createElement("div");
    weekdayCell.className = "weekday";
    weekdayCell.textContent = weekday;
    journalCalendar.appendChild(weekdayCell);
  });

  for (let i = 0; i < firstWeekdayIndex; i += 1) {
    const emptyCell = document.createElement("div");
    emptyCell.className = "empty-cell";
    journalCalendar.appendChild(emptyCell);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = formatDateKey(monthParts.year, monthParts.monthIndex, day);
    const entry = getDayEntryByKey(dateKey);
    const stateClass = getCalendarDayClass(entry);
    const selectedClass = dateKey === selectedDateKey ? "selected" : "";
    const todayClass = dateKey === todayKey ? "today" : "";

    const dayHours = getDayHours(entry);

    const dayCell = document.createElement("button");
    dayCell.type = "button";
    dayCell.className = `day-cell ${stateClass} ${selectedClass} ${todayClass}`.trim();
    dayCell.title = `Обычных: ${entry.regular}, доп.: ${entry.extra}, часов: ${formatNumber(dayHours)}`;

    const number = document.createElement("span");
    number.className = "day-num";
    number.textContent = String(day);

    const main = document.createElement("span");
    main.className = "day-main";
    main.textContent = getDayLabel(entry);

    const hours = document.createElement("span");
    hours.className = "day-hours";
    hours.textContent = dayHours > 0 ? `${formatNumber(dayHours)} ч` : "";

    dayCell.append(number, main, hours);
    dayCell.addEventListener("click", () => {
      selectedDateKey = dateKey;
      syncSelectedDayInputs();
      renderCalendar();
    });

    journalCalendar.appendChild(dayCell);
  }

  renderSummary(monthParts);
}

function setCurrentMonth() {
  const today = getTodayParts();
  journalMonthInput.value = formatMonthValue(today.year, today.monthIndex);
}

function isValidUsername(value) {
  return /^[a-zA-Z0-9._-]{3,32}$/.test(value);
}

function isValidPin(value) {
  return typeof value === "string" && value.length >= 4 && value.length <= 64;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createSalt() {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return bytesToHex(bytes);
  }

  return String(Math.random()).slice(2) + String(Date.now());
}

async function hashPin(pin, salt) {
  const raw = `${salt}:${pin}`;
  if (typeof crypto === "undefined" || !crypto.subtle) {
    return btoa(raw);
  }

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return bytesToHex(new Uint8Array(digest));
}

function showRegisterMode() {
  registerBlock.classList.remove("hidden");
  loginBlock.classList.add("hidden");
}

function showLoginMode() {
  registerBlock.classList.add("hidden");
  loginBlock.classList.remove("hidden");
}

function enterWorkspace() {
  profileName.textContent = account.username;
  authPanel.classList.add("hidden");
  workspacePanel.classList.remove("hidden");
  setAuthError("");
  setStatus("");
  if (!journalMonthInput.value) {
    setCurrentMonth();
  }
  renderCalendar();
}

function leaveWorkspace() {
  workspacePanel.classList.add("hidden");
  authPanel.classList.remove("hidden");
  setStatus("");
}

function applyInitialMode() {
  account = getAccountFromStorage();
  if (!account) {
    showRegisterMode();
    leaveWorkspace();
    return;
  }

  loginHint.textContent = `Профиль: ${account.username}`;
  loginName.value = account.username;

  if (hasActiveSession(account)) {
    journalData = getJournalDataFromStorage(account.username);
    enterWorkspace();
    return;
  }

  showLoginMode();
  leaveWorkspace();
}

async function handleRegister(event) {
  event.preventDefault();
  setAuthError("");

  if (getAccountFromStorage()) {
    setAuthError("Профиль уже создан. Войдите по существующим данным.");
    showLoginMode();
    return;
  }

  const username = registerName.value.trim();
  const pin = registerPin.value;
  const repeatPin = registerPinRepeat.value;

  if (!isValidUsername(username)) {
    setAuthError("Логин: 3-32 символа, латиница/цифры/._-");
    return;
  }

  if (!isValidPin(pin)) {
    setAuthError("PIN-код должен быть не короче 4 символов.");
    return;
  }

  if (pin !== repeatPin) {
    setAuthError("Повтор PIN-кода не совпадает.");
    return;
  }

  const salt = createSalt();
  const pinHash = await hashPin(pin, salt);

  account = {
    username,
    salt,
    pinHash,
    createdAt: new Date().toISOString(),
  };

  journalData = normalizeJournalData(null);
  saveAccountToStorage(account);
  saveJournalDataToStorage();
  activateSession(account.username);

  registerForm.reset();
  setCurrentMonth();
  enterWorkspace();
  setStatus("Профиль создан. Можно отмечать смены.", "ok");
}

async function handleLogin(event) {
  event.preventDefault();
  setAuthError("");

  const storedAccount = getAccountFromStorage();
  if (!storedAccount) {
    showRegisterMode();
    setAuthError("Профиль не найден. Сначала зарегистрируйтесь.");
    return;
  }

  const username = loginName.value.trim();
  const pin = loginPin.value;

  if (username !== storedAccount.username) {
    setAuthError("Логин не найден на этом устройстве.");
    return;
  }

  const pinHash = await hashPin(pin, storedAccount.salt);
  if (pinHash !== storedAccount.pinHash) {
    setAuthError("Неверный PIN-код.");
    return;
  }

  account = storedAccount;
  journalData = getJournalDataFromStorage(account.username);
  activateSession(account.username);
  loginForm.reset();
  loginName.value = account.username;
  setCurrentMonth();
  enterWorkspace();
}

function handleLogout() {
  clearSession();
  leaveWorkspace();
  showLoginMode();
  setAuthError("");
  setStatus("");
  if (account) {
    loginName.value = account.username;
    loginHint.textContent = `Профиль: ${account.username}`;
  }
}

function handleDeleteAccount() {
  if (!account) {
    return;
  }

  const confirmed = window.confirm("Удалить профиль и все отмеченные смены на этом устройстве?");
  if (!confirmed) {
    return;
  }

  localStorage.removeItem(getDataStorageKey(account.username));
  removeAccountFromStorage();
  clearSession();
  account = null;
  journalData = normalizeJournalData(null);
  selectedDateKey = null;

  loginForm.reset();
  registerForm.reset();
  setStatus("");
  setAuthError("");
  showRegisterMode();
  leaveWorkspace();
}

function updateSettingsFromInputs() {
  const baseHours = normalizeHours(baseShiftHoursInput.value, NaN);
  const extraHours = normalizeHours(extraShiftHoursInput.value, NaN);

  if (!Number.isFinite(baseHours) || !Number.isFinite(extraHours)) {
    setStatus("Введите корректное время смены (больше 0).", "warn");
    syncSettingsInputs();
    return false;
  }

  journalData.settings.baseShiftHours = baseHours;
  journalData.settings.extraShiftHours = extraHours;
  journalData.updatedAt = new Date().toISOString();
  saveJournalDataToStorage();
  renderCalendar();
  setStatus("Параметры времени обновлены.", "ok");
  return true;
}

function handleSaveSelectedDay() {
  if (!account || !selectedDateKey) {
    setStatus("Выберите день в календаре.", "warn");
    return;
  }

  const regularRaw = Number(selectedRegularShiftCount.value);
  const extraRaw = Number(selectedExtraShiftCount.value);
  const validRegular = Number.isInteger(regularRaw) && regularRaw >= 0;
  const validExtra = Number.isInteger(extraRaw) && extraRaw >= 0;

  if (!validRegular || !validExtra) {
    setStatus("Укажите целое число смен от 0 и выше.", "warn");
    return;
  }

  setDayEntryByKey(selectedDateKey, regularRaw, extraRaw);

  journalData.updatedAt = new Date().toISOString();
  saveJournalDataToStorage();
  renderCalendar();
  setStatus("Данные дня сохранены.", "ok");
}

function handleClearSelectedDay() {
  if (!selectedDateKey) {
    setStatus("Сначала выберите день в календаре.", "warn");
    return;
  }

  selectedRegularShiftCount.value = "0";
  selectedExtraShiftCount.value = "0";
  handleSaveSelectedDay();
}

function handleMonthChange() {
  const monthParts = parseMonthValue(journalMonthInput.value);
  if (!monthParts) {
    return;
  }

  selectedDateKey = null;
  ensureSelectedDate(monthParts);
  renderCalendar();
}

function setupHandlers() {
  registerForm.addEventListener("submit", handleRegister);
  loginForm.addEventListener("submit", handleLogin);
  logoutBtn.addEventListener("click", handleLogout);
  deleteAccountBtn.addEventListener("click", handleDeleteAccount);
  saveDayBtn.addEventListener("click", handleSaveSelectedDay);
  clearDayBtn.addEventListener("click", handleClearSelectedDay);
  journalMonthInput.addEventListener("change", handleMonthChange);
  currentMonthBtn.addEventListener("click", () => {
    setCurrentMonth();
    handleMonthChange();
  });

  [baseShiftHoursInput, extraShiftHoursInput].forEach((field) => {
    field.addEventListener("change", updateSettingsFromInputs);
    field.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        updateSettingsFromInputs();
      }
    });
  });

  [selectedRegularShiftCount, selectedExtraShiftCount].forEach((field) => {
    field.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleSaveSelectedDay();
      }
    });
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

function init() {
  setupHandlers();
  setCurrentMonth();
  applyInitialMode();
  registerServiceWorker();
}

init();
