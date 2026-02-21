const plannerForm = document.getElementById("plannerForm");
const schedulePreset = document.getElementById("schedulePreset");
const customSchedule = document.getElementById("customSchedule");
const workDaysInput = document.getElementById("workDays");
const restDaysInput = document.getElementById("restDays");
const startDateInput = document.getElementById("startDate");
const hoursPerShiftInput = document.getElementById("hoursPerShift");
const hourRateInput = document.getElementById("hourRate");
const targetMonthInput = document.getElementById("targetMonth");
const timeZoneSelect = document.getElementById("timeZone");
const autoTimeZoneBtn = document.getElementById("autoTimeZone");
const extraShiftDateInput = document.getElementById("extraShiftDate");
const extraShiftHoursInput = document.getElementById("extraShiftHours");
const addExtraShiftBtn = document.getElementById("addExtraShiftBtn");
const extraShiftList = document.getElementById("extraShiftList");
const errorBox = document.getElementById("errorBox");
const shiftCount = document.getElementById("shiftCount");
const hourCount = document.getElementById("hourCount");
const extraHoursCount = document.getElementById("extraHoursCount");
const restCount = document.getElementById("restCount");
const incomeCount = document.getElementById("incomeCount");
const earnedToDate = document.getElementById("earnedToDate");
const monthTitle = document.getElementById("monthTitle");
const patternInfo = document.getElementById("patternInfo");
const todayInfo = document.getElementById("todayInfo");
const calendar = document.getElementById("calendar");
const installBtn = document.getElementById("installBtn");
const installHint = document.getElementById("installHint");

const STORAGE_KEY = "shift-planner-settings-v2";
const DAY_MS = 24 * 60 * 60 * 1000;
const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const monthNames = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
];
const fallbackTimeZones = [
  "Europe/Moscow",
  "Europe/Kaliningrad",
  "Europe/Samara",
  "Asia/Yekaterinburg",
  "Asia/Omsk",
  "Asia/Krasnoyarsk",
  "Asia/Irkutsk",
  "Asia/Yakutsk",
  "Asia/Vladivostok",
  "Asia/Magadan",
  "Asia/Kamchatka",
  "UTC",
];

let deferredInstallPrompt = null;
let extraShifts = {};

function formatNumber(value) {
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

function formatMoney(value) {
  const hasFraction = Math.abs(value % 1) > 0.001;
  return value.toLocaleString("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: hasFraction ? 2 : 0,
  });
}

function formatMoneyCompact(value) {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${millions.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн ₽`;
  }

  if (value >= 1_000) {
    const thousands = value / 1_000;
    return `${thousands.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} тыс ₽`;
  }

  return formatMoney(value);
}

function setDefaultMonth() {
  if (targetMonthInput.value) {
    return;
  }

  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  targetMonthInput.value = `${now.getFullYear()}-${month}`;
}

function setDefaultStartDate() {
  if (startDateInput.value) {
    return;
  }

  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  startDateInput.value = `${now.getFullYear()}-${month}-${day}`;
}

function toggleCustomInputs() {
  const isCustom = schedulePreset.value === "custom";
  customSchedule.classList.toggle("hidden", !isCustom);
  customSchedule.setAttribute("aria-hidden", String(!isCustom));
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}

function hideError() {
  errorBox.textContent = "";
  errorBox.classList.add("hidden");
}

function parseDateInput(value) {
  if (!value) {
    return null;
  }

  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    return null;
  }

  const [year, month, day] = parts;
  return Date.UTC(year, month - 1, day);
}

function parseMonthInput(value) {
  if (!value) {
    return null;
  }

  const parts = value.split("-").map(Number);
  if (parts.length !== 2 || parts.some(Number.isNaN)) {
    return null;
  }

  const [year, month] = parts;
  if (month < 1 || month > 12) {
    return null;
  }

  return { year, monthIndex: month - 1 };
}

function formatDateKey(year, monthIndex, day) {
  const month = String(monthIndex + 1).padStart(2, "0");
  const dayPart = String(day).padStart(2, "0");
  return `${year}-${month}-${dayPart}`;
}

function parseDateKey(dateKey) {
  const parts = String(dateKey).split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    return null;
  }

  const [year, month, day] = parts;
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return { year, monthIndex: month - 1, day };
}

function sanitizeExtraShifts(value) {
  if (!value || typeof value !== "object") {
    return {};
  }

  const entries = Object.entries(value);
  const sanitized = {};

  entries.forEach(([dateKey, hours]) => {
    const dateParts = parseDateKey(dateKey);
    const numericHours = Number(hours);
    if (!dateParts || !Number.isFinite(numericHours) || numericHours <= 0) {
      return;
    }

    sanitized[dateKey] = Number(numericHours.toFixed(2));
  });

  return sanitized;
}

function getExtraHoursForDateKey(dateKey) {
  const value = Number(extraShifts[dateKey] || 0);
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return value;
}

function formatDateKeyLabel(dateKey) {
  const parts = parseDateKey(dateKey);
  if (!parts) {
    return dateKey;
  }

  const date = new Date(Date.UTC(parts.year, parts.monthIndex, parts.day));
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

function renderExtraShiftList() {
  if (!extraShiftList) {
    return;
  }

  const sorted = Object.entries(extraShifts).sort(([a], [b]) => a.localeCompare(b));
  extraShiftList.innerHTML = "";

  if (sorted.length === 0) {
    const empty = document.createElement("li");
    empty.className = "extra-shift-empty";
    empty.textContent = "Доп. смен пока нет";
    extraShiftList.appendChild(empty);
    return;
  }

  sorted.forEach(([dateKey, hours]) => {
    const item = document.createElement("li");
    item.className = "extra-shift-item";

    const text = document.createElement("span");
    text.textContent = `${formatDateKeyLabel(dateKey)} — ${formatNumber(hours)} ч`;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-extra-btn";
    removeBtn.dataset.dateKey = dateKey;
    removeBtn.textContent = "Удалить";

    item.append(text, removeBtn);
    extraShiftList.appendChild(item);
  });
}

function setDefaultExtraShiftDate() {
  if (!extraShiftDateInput || extraShiftDateInput.value) {
    return;
  }

  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  extraShiftDateInput.value = `${now.getFullYear()}-${month}-${day}`;
}

function addExtraShiftEntry() {
  hideError();

  const dateValue = extraShiftDateInput.value;
  const dateParts = parseDateKey(dateValue);
  if (!dateParts) {
    showError("Выберите корректную дату доп. смены.");
    return;
  }

  const hours = Number(extraShiftHoursInput.value);
  if (!Number.isFinite(hours) || hours <= 0) {
    showError("Введите корректное число часов для доп. смены.");
    return;
  }

  const dateKey = formatDateKey(dateParts.year, dateParts.monthIndex, dateParts.day);
  const current = getExtraHoursForDateKey(dateKey);
  extraShifts[dateKey] = Number((current + hours).toFixed(2));
  renderExtraShiftList();
  calculateMonth();
}

function removeExtraShiftEntry(dateKey) {
  if (!dateKey || !Object.prototype.hasOwnProperty.call(extraShifts, dateKey)) {
    return;
  }

  delete extraShifts[dateKey];
  renderExtraShiftList();
  calculateMonth();
}

function parseSchedulePattern() {
  if (schedulePreset.value !== "custom") {
    const [work, rest] = schedulePreset.value.split("/").map(Number);
    return { workDays: work, restDays: rest, label: `${work}/${rest}` };
  }

  const workDays = Number(workDaysInput.value);
  const restDays = Number(restDaysInput.value);

  if (!Number.isInteger(workDays) || workDays < 1) {
    throw new Error("Введите корректное число рабочих дней.");
  }

  if (!Number.isInteger(restDays) || restDays < 1) {
    throw new Error("Введите корректное число выходных дней.");
  }

  return { workDays, restDays, label: `${workDays}/${restDays}` };
}

function isWorkDay(targetUTC, firstWorkDayUTC, workDays, restDays) {
  const cycle = workDays + restDays;
  const diffDays = Math.floor((targetUTC - firstWorkDayUTC) / DAY_MS);
  const position = ((diffDays % cycle) + cycle) % cycle;
  return position < workDays;
}

function compareDateParts(year, monthIndex, day, current) {
  if (year !== current.year) {
    return year - current.year;
  }

  if (monthIndex !== current.monthIndex) {
    return monthIndex - current.monthIndex;
  }

  return day - current.day;
}

function isValidTimeZone(timeZone) {
  if (!timeZone) {
    return false;
  }

  try {
    new Intl.DateTimeFormat("ru-RU", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function getSupportedTimeZones() {
  if (typeof Intl.supportedValuesOf === "function") {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return fallbackTimeZones;
    }
  }

  return fallbackTimeZones;
}

function getSystemTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function ensureTimeZoneOption(timeZone) {
  if (!timeZone || Array.from(timeZoneSelect.options).some((option) => option.value === timeZone)) {
    return;
  }

  const option = document.createElement("option");
  option.value = timeZone;
  option.textContent = timeZone;
  timeZoneSelect.prepend(option);
}

function populateTimeZones() {
  const supported = getSupportedTimeZones();
  const fragment = document.createDocumentFragment();

  supported.forEach((timeZone) => {
    const option = document.createElement("option");
    option.value = timeZone;
    option.textContent = timeZone;
    fragment.appendChild(option);
  });

  timeZoneSelect.innerHTML = "";
  timeZoneSelect.appendChild(fragment);

  const systemTimeZone = getSystemTimeZone();
  ensureTimeZoneOption(systemTimeZone);
  timeZoneSelect.value = systemTimeZone;
}

function getTodayInTimeZone(timeZone) {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    const partMap = {};
    formatter.formatToParts(new Date()).forEach((part) => {
      if (part.type !== "literal") {
        partMap[part.type] = part.value;
      }
    });

    return {
      year: Number(partMap.year),
      monthIndex: Number(partMap.month) - 1,
      day: Number(partMap.day),
    };
  } catch {
    const now = new Date();
    return {
      year: now.getFullYear(),
      monthIndex: now.getMonth(),
      day: now.getDate(),
    };
  }
}

function formatTodayLabel(current, timeZone) {
  return `${current.day} ${monthNames[current.monthIndex]} ${current.year} (${timeZone})`;
}

function persistState() {
  const state = {
    startDate: startDateInput.value,
    schedulePreset: schedulePreset.value,
    workDays: workDaysInput.value,
    restDays: restDaysInput.value,
    hoursPerShift: hoursPerShiftInput.value,
    hourRate: hourRateInput.value,
    targetMonth: targetMonthInput.value,
    timeZone: timeZoneSelect.value,
    extraShifts,
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function restoreState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return;
  }

  try {
    const state = JSON.parse(raw);

    if (state.startDate) {
      startDateInput.value = state.startDate;
    }

    if (state.schedulePreset) {
      schedulePreset.value = state.schedulePreset;
    }

    if (state.workDays) {
      workDaysInput.value = state.workDays;
    }

    if (state.restDays) {
      restDaysInput.value = state.restDays;
    }

    if (state.hoursPerShift) {
      hoursPerShiftInput.value = state.hoursPerShift;
    }

    if (state.hourRate) {
      hourRateInput.value = state.hourRate;
    }

    if (state.targetMonth) {
      targetMonthInput.value = state.targetMonth;
    }

    if (state.timeZone && isValidTimeZone(state.timeZone)) {
      ensureTimeZoneOption(state.timeZone);
      timeZoneSelect.value = state.timeZone;
    }

    extraShifts = sanitizeExtraShifts(state.extraShifts);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    extraShifts = {};
  }
}

function renderCalendar(days, firstWeekdayIndex) {
  calendar.innerHTML = "";

  weekdays.forEach((dayName) => {
    const weekdayCell = document.createElement("div");
    weekdayCell.className = "weekday";
    weekdayCell.textContent = dayName;
    calendar.appendChild(weekdayCell);
  });

  for (let i = 0; i < firstWeekdayIndex; i += 1) {
    const empty = document.createElement("div");
    empty.className = "empty-cell";
    calendar.appendChild(empty);
  }

  days.forEach((day) => {
    const card = document.createElement("div");
    const stateClass = day.isWork ? "work-day" : "rest-day";
    const todayClass = day.isToday ? "is-today" : "";
    const futureClass = day.isFuture ? "is-future" : "";
    const incomeClass = day.earned > 0 ? "has-income" : "";
    const extraClass = day.extraHours > 0 ? "has-extra" : "";
    card.className = `day-card ${stateClass} ${todayClass} ${futureClass} ${incomeClass} ${extraClass}`.trim();

    const dayNumber = document.createElement("div");
    dayNumber.className = "day-number";
    dayNumber.textContent = day.dayOfMonth;

    const dayType = document.createElement("div");
    dayType.className = "day-type";
    if (day.extraHours > 0 && day.isWork) {
      dayType.textContent = "смена + доп.";
    } else if (day.extraHours > 0) {
      dayType.textContent = "доп. смена";
    } else {
      dayType.textContent = day.isWork ? "смена" : "выходной";
    }

    card.append(dayNumber, dayType);

    if (day.extraHours > 0) {
      const dayExtra = document.createElement("div");
      dayExtra.className = "day-extra";
      dayExtra.textContent = `+${formatNumber(day.extraHours)} ч`;
      card.appendChild(dayExtra);
    }

    if (day.earned > 0) {
      const dayIncome = document.createElement("div");
      dayIncome.className = "day-income";
      dayIncome.textContent = `+${formatMoneyCompact(day.earned)}`;
      dayIncome.title = formatMoney(day.earned);
      card.appendChild(dayIncome);
    }

    if (day.isToday) {
      const todayBadge = document.createElement("div");
      todayBadge.className = "today-badge";
      todayBadge.textContent = "сегодня";
      card.appendChild(todayBadge);

      const totalBadge = document.createElement("div");
      totalBadge.className = "day-total";
      totalBadge.textContent = `Итого: ${formatMoney(day.cumulativeEarned)}`;
      card.appendChild(totalBadge);
    }

    calendar.appendChild(card);
  });
}

function calculateMonth() {
  hideError();

  const firstWorkDayUTC = parseDateInput(startDateInput.value);
  if (!firstWorkDayUTC) {
    showError("Выберите дату первого рабочего дня.");
    return;
  }

  const monthData = parseMonthInput(targetMonthInput.value);
  if (!monthData) {
    showError("Выберите месяц для расчета.");
    return;
  }

  const hoursPerShift = Number(hoursPerShiftInput.value);
  if (!Number.isFinite(hoursPerShift) || hoursPerShift <= 0) {
    showError("Введите корректное количество часов за смену.");
    return;
  }

  const hourRate = Number(hourRateInput.value);
  if (!Number.isFinite(hourRate) || hourRate < 0) {
    showError("Введите корректную стоимость часа.");
    return;
  }

  if (!isValidTimeZone(timeZoneSelect.value)) {
    showError("Выберите корректный часовой пояс.");
    return;
  }

  let pattern;
  try {
    pattern = parseSchedulePattern();
  } catch (error) {
    showError(error.message);
    return;
  }

  const today = getTodayInTimeZone(timeZoneSelect.value);
  const { year, monthIndex } = monthData;
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const firstDayWeek = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const firstWeekdayIndex = (firstDayWeek + 6) % 7;

  let workCount = 0;
  let freeCount = 0;
  let extraHoursTotal = 0;
  let earnedSoFar = 0;

  const days = [];

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = formatDateKey(year, monthIndex, day);
    const currentUTC = Date.UTC(year, monthIndex, day);
    const isWork = isWorkDay(currentUTC, firstWorkDayUTC, pattern.workDays, pattern.restDays);
    const extraHours = getExtraHoursForDateKey(dateKey);
    const baseHours = isWork ? hoursPerShift : 0;
    const dayHours = baseHours + extraHours;
    extraHoursTotal += extraHours;

    if (isWork) {
      workCount += 1;
    } else {
      freeCount += 1;
    }

    const relation = compareDateParts(year, monthIndex, day, today);
    const isPastOrToday = relation <= 0;
    const isFuture = relation > 0;
    const isToday = relation === 0;

    const shiftIncome = dayHours * hourRate;
    const earned = isPastOrToday ? shiftIncome : 0;

    if (earned > 0) {
      earnedSoFar += earned;
    }

    days.push({
      dayOfMonth: day,
      isWork,
      isFuture,
      isToday,
      extraHours,
      dayHours,
      earned,
      cumulativeEarned: earnedSoFar,
    });
  }

  const totalHours = workCount * hoursPerShift + extraHoursTotal;
  const totalIncome = totalHours * hourRate;

  shiftCount.textContent = formatNumber(workCount);
  hourCount.textContent = formatNumber(totalHours);
  extraHoursCount.textContent = formatNumber(extraHoursTotal);
  restCount.textContent = formatNumber(freeCount);
  incomeCount.textContent = formatMoney(totalIncome);
  earnedToDate.textContent = formatMoney(earnedSoFar);

  monthTitle.textContent = `${monthNames[monthIndex]} ${year}`;
  patternInfo.textContent = `График ${pattern.label} · ${formatNumber(hoursPerShift)} ч/смена · доп ${formatNumber(extraHoursTotal)} ч · ${formatMoney(hourRate)}/ч`;
  todayInfo.textContent = `Сегодня по выбранному часовому поясу: ${formatTodayLabel(today, timeZoneSelect.value)}`;

  renderCalendar(days, firstWeekdayIndex);
  persistState();
}

function useSystemTimeZone() {
  const systemTimeZone = getSystemTimeZone();
  ensureTimeZoneOption(systemTimeZone);
  timeZoneSelect.value = systemTimeZone;
  calculateMonth();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      installHint.textContent = "Офлайн-режим недоступен: не удалось зарегистрировать сервис-воркер.";
    });
  });
}

function isStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function refreshInstallUi() {
  if (isStandaloneMode()) {
    installBtn.classList.add("hidden");
    installHint.textContent = "Приложение установлено. Вы можете запускать его с главного экрана.";
    return;
  }

  if (deferredInstallPrompt) {
    installBtn.classList.remove("hidden");
    installHint.textContent = "Нажмите «Установить приложение», чтобы запускать как нативное приложение.";
    return;
  }

  installBtn.classList.add("hidden");
  installHint.textContent = "Если браузер поддерживает установку, появится кнопка для установки приложения.";
}

async function installApp() {
  if (!deferredInstallPrompt) {
    refreshInstallUi();
    return;
  }

  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  refreshInstallUi();
}

function setupInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    refreshInstallUi();
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    refreshInstallUi();
  });

  installBtn.addEventListener("click", installApp);
  refreshInstallUi();
}

schedulePreset.addEventListener("change", () => {
  toggleCustomInputs();
  calculateMonth();
});

plannerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  calculateMonth();
});

[startDateInput, workDaysInput, restDaysInput, hoursPerShiftInput, hourRateInput, targetMonthInput, timeZoneSelect].forEach((field) => {
  field.addEventListener("change", calculateMonth);
});

autoTimeZoneBtn.addEventListener("click", useSystemTimeZone);
addExtraShiftBtn.addEventListener("click", addExtraShiftEntry);
extraShiftList.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) {
    return;
  }

  if (target.classList.contains("remove-extra-btn")) {
    removeExtraShiftEntry(target.dataset.dateKey);
  }
});

[extraShiftDateInput, extraShiftHoursInput].forEach((field) => {
  field.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addExtraShiftEntry();
    }
  });
});

populateTimeZones();
restoreState();
setDefaultMonth();
setDefaultStartDate();
setDefaultExtraShiftDate();
toggleCustomInputs();
renderExtraShiftList();
setupInstallPrompt();
registerServiceWorker();
calculateMonth();
