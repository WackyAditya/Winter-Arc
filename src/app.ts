/**
 * Winter Arc Discipline Tracker - Main Application Engine
 * Includes Google Calendar Integration via Firebase Auth & Workspace API
 */

import {
  initAuth,
  googleSignIn,
  logout,
  getAccessToken,
  SCOPES,
} from './firebase';
import {
  listTodayEvents,
  createCalendarEvent,
  deleteCalendarEvent,
  type CalendarEvent,
} from './calendar';
import type { User } from 'firebase/auth';
import confetti from 'canvas-confetti';

// Types
export interface Habit {
  id: string;
  title: string;
  category: string;
  target?: string;
  defaultTime?: string; // e.g. "05:00", "06:00", "09:00", "21:00"
}

interface AppState {
  habits: Habit[];
  history: Record<string, string[]>; // YYYY-MM-DD -> habit IDs
  soundEnabled: boolean;
  monkMode: boolean;
  activeFilter: 'all' | 'pending' | 'completed';
  quoteIndex: number;
  currentUser: User | null;
  calendarEvents: CalendarEvent[];
  isCalendarLoading: boolean;
  calendarError: string | null;
}

const STORAGE_KEY = 'winter_arc_tracker_v1';

const DEFAULT_HABITS: Habit[] = [
  { id: 'hab-1', title: '05:00 AM Wakeup / Cold Start', category: 'Routine', target: '05:00 AM', defaultTime: '05:00' },
  { id: 'hab-2', title: 'Heavy Training / 10k Steps', category: 'Physical', target: '60+ min', defaultTime: '06:30' },
  { id: 'hab-3', title: 'Clean Nutrition (Zero Refined Sugar)', category: 'Nutrition', target: '100% Clean', defaultTime: '12:30' },
  { id: 'hab-4', title: 'Deep Work / Coding & Problem Solving (2+ hrs)', category: 'Focus', target: '2.5 hrs', defaultTime: '09:00' },
  { id: 'hab-5', title: 'No Screen Time 1 hr Before Sleep', category: 'Recovery', target: '9:30 PM', defaultTime: '21:30' },
];

const QUOTES = [
  { text: "We don't rise to the level of our expectations, we fall to the level of our training.", author: "Archilochus" },
  { text: "No man is free who is not master of himself.", author: "Epictetus" },
  { text: "Don't count the days, make the days count.", author: "Muhammad Ali" },
  { text: "The discipline you learn and character you build from the carving and sculpting of yourself will stay with you your entire life.", author: "David Goggins" },
  { text: "Discipline equals freedom.", author: "Jocko Willink" },
  { text: "You have power over your mind - not outside events. Realize this, and you will find strength.", author: "Marcus Aurelius" },
  { text: "He who has a why to live can bear almost any how.", author: "Friedrich Nietzsche" },
  { text: "There is nothing outside of yourself that can ever enable you to get better, stronger, or faster. Everything is within.", author: "Miyamoto Musashi" },
  { text: "It is not that we have a short time to live, but that we waste a lot of it.", author: "Seneca" },
  { text: "Great things come from hard work and perseverance. No excuses.", author: "Kobe Bryant" },
  { text: "First say to yourself what you would be; and then do what you have to do.", author: "Epictetus" },
  { text: "Suffer the pain of discipline or suffer the pain of regret.", author: "Jim Rohn" },
  { text: "In the depth of winter, I finally learned that within me there lay an invincible summer.", author: "Albert Camus" },
];

const state: AppState = {
  habits: [...DEFAULT_HABITS],
  history: {},
  soundEnabled: true,
  monkMode: false,
  activeFilter: 'all',
  quoteIndex: 0,
  currentUser: null,
  calendarEvents: [],
  isCalendarLoading: false,
  calendarError: null,
};

// Pending actions for confirmation modals
let pendingCalendarSync: { habitsToSync: Habit[]; date: string } | null = null;
let pendingEventDelete: { eventId: string; summary: string } | null = null;
let pendingScheduleHabit: Habit | null = null;

// Helpers
function getTodayKey(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCompletedTodayIds(): string[] {
  const todayKey = getTodayKey();
  return state.history[todayKey] || [];
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message: string, type: 'success' | 'warning' | 'info' = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `px-4 py-2.5 rounded-xl border text-xs font-mono font-medium shadow-xl backdrop-blur-md flex items-center gap-2 transform transition-all duration-300 pointer-events-auto ${
    type === 'success'
      ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
      : type === 'warning'
      ? 'bg-amber-950/90 border-amber-500/40 text-amber-200'
      : 'bg-surface/90 border-borderline text-neutral-200'
  }`;

  const iconName = type === 'success' ? 'check' : type === 'warning' ? 'alert-circle' : 'info';
  toast.innerHTML = `<i data-lucide="${iconName}" class="w-3.5 h-3.5"></i><span>${message}</span>`;
  container.appendChild(toast);
  // @ts-ignore
  if (window.lucide) window.lucide.createIcons();

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

// Confetti Particle Celebration Effect
export function triggerVictoryConfetti() {
  const count = 200;
  const defaults = {
    origin: { y: 0.7 },
    colors: ['#f59e0b', '#fbbf24', '#10b981', '#34d399', '#ffffff', '#e5e7eb'],
    zIndex: 9999,
  };

  function fire(particleRatio: number, opts: confetti.Options) {
    confetti({
      ...defaults,
      ...opts,
      particleCount: Math.floor(count * particleRatio),
    });
  }

  // Realistic explosive physics burst
  fire(0.25, {
    spread: 26,
    startVelocity: 55,
  });
  fire(0.2, {
    spread: 60,
  });
  fire(0.35, {
    spread: 100,
    decay: 0.91,
    scalar: 0.8,
  });
  fire(0.1, {
    spread: 120,
    startVelocity: 25,
    decay: 0.92,
    scalar: 1.2,
  });
  fire(0.1, {
    spread: 120,
    startVelocity: 45,
  });

  // Secondary side cannons for an epic celebratory burst
  setTimeout(() => {
    confetti({
      particleCount: 60,
      angle: 60,
      spread: 65,
      origin: { x: 0, y: 0.75 },
      colors: ['#f59e0b', '#10b981', '#ffffff'],
      zIndex: 9999,
    });
    confetti({
      particleCount: 60,
      angle: 120,
      spread: 65,
      origin: { x: 1, y: 0.75 },
      colors: ['#f59e0b', '#10b981', '#ffffff'],
      zIndex: 9999,
    });
  }, 250);
}

// Web Audio API Synthesizer
function playTactileSound(type: 'check' | 'uncheck' | 'conquered' = 'check') {
  if (!state.soundEnabled) return;
  try {
    // @ts-ignore
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    if (type === 'check') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.start();
      osc.stop(ctx.currentTime + 0.13);
    } else if (type === 'uncheck') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(330, ctx.currentTime + 0.07);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.start();
      osc.stop(ctx.currentTime + 0.09);
    } else if (type === 'conquered') {
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.09, ctx.currentTime + idx * 0.06);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35 + idx * 0.06);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(ctx.currentTime + idx * 0.06);
        o.stop(ctx.currentTime + 0.4 + idx * 0.06);
      });
    }
  } catch (e) {
    // Audio muted
  }
}

function updateBackendStatus(online: boolean) {
  const pill = document.getElementById('backendStatusPill');
  const text = document.getElementById('backendStatusText');
  if (!pill || !text) return;

  if (online) {
    pill.className = 'flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-400';
    text.innerText = 'Backend Synced';
  } else {
    pill.className = 'flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-neutral-700 bg-neutral-800 text-[10px] text-neutral-400';
    text.innerText = 'Local Storage';
  }
}

// Local and Remote Storage
async function loadStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.habits && Array.isArray(parsed.habits)) state.habits = parsed.habits;
      if (parsed.history && typeof parsed.history === 'object') state.history = parsed.history;
      if (typeof parsed.soundEnabled === 'boolean') state.soundEnabled = parsed.soundEnabled;
      if (typeof parsed.monkMode === 'boolean') state.monkMode = parsed.monkMode;
    }
  } catch (e) {
    console.error('Failed to load local storage:', e);
  }

  // Fetch state from server database
  try {
    const res = await fetch('/api/state');
    if (res.ok) {
      const serverState = await res.json();
      if (Array.isArray(serverState.habits) && serverState.habits.length > 0) {
        state.habits = serverState.habits;
      }
      if (serverState.history && typeof serverState.history === 'object') {
        state.history = serverState.history;
      }
      if (typeof serverState.soundEnabled === 'boolean') {
        state.soundEnabled = serverState.soundEnabled;
      }
      if (typeof serverState.monkMode === 'boolean') {
        state.monkMode = serverState.monkMode;
      }
      updateBackendStatus(true);
      renderHabits();
      computeStreakAndStats();
      renderMatrixGrid();
      applyMonkMode();
      updateSoundUI();
    } else {
      updateBackendStatus(false);
    }
  } catch (err) {
    updateBackendStatus(false);
  }
}

let backendSaveTimeout: any = null;

function saveStorage() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        habits: state.habits,
        history: state.history,
        soundEnabled: state.soundEnabled,
        monkMode: state.monkMode,
      })
    );
  } catch (e) {
    console.error('Failed to save storage:', e);
  }

  // Debounced async persistence to backend API
  if (backendSaveTimeout) clearTimeout(backendSaveTimeout);
  backendSaveTimeout = setTimeout(async () => {
    try {
      const res = await fetch('/api/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          habits: state.habits,
          history: state.history,
          soundEnabled: state.soundEnabled,
          monkMode: state.monkMode,
        }),
      });
      if (res.ok) {
        updateBackendStatus(true);
      }
    } catch (e) {
      updateBackendStatus(false);
    }
  }, 350);
}

// Countdown Engine
function initCountdown() {
  function updateTimer() {
    const now = new Date();
    let targetYear = now.getFullYear();
    if (now.getMonth() >= 9) {
      targetYear = now.getFullYear() + 1;
    }
    const targetDate = new Date(targetYear, 0, 1, 0, 0, 0);
    const diffMs = targetDate.getTime() - now.getTime();

    const daysEl = document.getElementById('clockDays');
    const hoursEl = document.getElementById('clockHours');
    const minsEl = document.getElementById('clockMinutes');
    const secsEl = document.getElementById('clockSeconds');
    const arcPercentEl = document.getElementById('arcPercentText');
    const arcRemainingEl = document.getElementById('arcDaysRemaining');
    const arcBarEl = document.getElementById('arcProgressBar');
    const arcBadgeEl = document.getElementById('arcDayBadge');

    if (diffMs <= 0) {
      if (daysEl) daysEl.innerText = '00';
      if (hoursEl) hoursEl.innerText = '00';
      if (minsEl) minsEl.innerText = '00';
      if (secsEl) secsEl.innerText = '00';
      if (arcPercentEl) arcPercentEl.innerText = '100%';
      if (arcRemainingEl) arcRemainingEl.innerText = 'Arc Conquered!';
      if (arcBarEl) arcBarEl.style.width = '100%';
      return;
    }

    const seconds = Math.floor((diffMs / 1000) % 60);
    const minutes = Math.floor((diffMs / 1000 / 60) % 60);
    const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (daysEl) daysEl.innerText = String(days).padStart(2, '0');
    if (hoursEl) hoursEl.innerText = String(hours).padStart(2, '0');
    if (minsEl) minsEl.innerText = String(minutes).padStart(2, '0');
    if (secsEl) secsEl.innerText = String(seconds).padStart(2, '0');
    if (arcRemainingEl) arcRemainingEl.innerText = `${days} Days Remaining`;

    const arcStartDate = new Date(targetYear - 1, 9, 1, 0, 0, 0);
    const totalArcMs = targetDate.getTime() - arcStartDate.getTime();
    const elapsedMs = Math.max(0, now.getTime() - arcStartDate.getTime());
    const arcProgressPercent = Math.min(100, Math.max(0, (elapsedMs / totalArcMs) * 100));

    if (arcPercentEl) arcPercentEl.innerText = `${arcProgressPercent.toFixed(1)}%`;
    if (arcBarEl) arcBarEl.style.width = `${arcProgressPercent}%`;

    const arcDayNumber = Math.min(92, Math.max(1, Math.floor(elapsedMs / (1000 * 60 * 60 * 24)) + 1));
    if (arcBadgeEl) arcBadgeEl.innerText = `DAY ${arcDayNumber} OF 92`;
  }

  updateTimer();
  setInterval(updateTimer, 1000);
}

// Quotes
function renderQuote() {
  const q = QUOTES[state.quoteIndex % QUOTES.length];
  const textEl = document.getElementById('quoteText');
  const authorEl = document.getElementById('quoteAuthor');
  if (textEl) textEl.innerText = `"${q.text}"`;
  if (authorEl) authorEl.innerText = `— ${q.author}`;
}

export function shuffleQuote() {
  state.quoteIndex = (state.quoteIndex + 1) % QUOTES.length;
  renderQuote();
  playTactileSound('uncheck');
}

// Streak & Statistics
function computeStreakAndStats() {
  const completedToday = getCompletedTodayIds();
  const totalHabits = state.habits.length;

  let perfectStreak = 0;
  let totalConqueredDays = 0;
  let totalCompletions = 0;

  Object.entries(state.history).forEach(([, completedIds]) => {
    if (Array.isArray(completedIds)) {
      totalCompletions += completedIds.length;
      if (totalHabits > 0 && completedIds.length >= totalHabits) {
        totalConqueredDays++;
      }
    }
  });

  const checkDate = new Date();
  const isTodayFull = totalHabits > 0 && completedToday.length >= totalHabits;

  let d = new Date(checkDate);
  if (!isTodayFull) {
    d.setDate(d.getDate() - 1);
  }

  while (true) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateKey = `${y}-${m}-${day}`;

    const dayDone = state.history[dateKey] || [];
    if (totalHabits > 0 && dayDone.length >= totalHabits) {
      perfectStreak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }

  const streakEl = document.getElementById('currentStreakCount');
  const conqueredEl = document.getElementById('totalConqueredCount');
  const totalDoneEl = document.getElementById('totalCompletionsCount');
  if (streakEl) streakEl.innerText = String(perfectStreak);
  if (conqueredEl) conqueredEl.innerText = String(totalConqueredDays);
  if (totalDoneEl) totalDoneEl.innerText = String(totalCompletions);

  // SVG Progress Ring
  const ringFraction = totalHabits > 0 ? completedToday.length / totalHabits : 0;
  const ringPercent = Math.round(ringFraction * 100);
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - ringFraction * circumference;

  const circle = document.getElementById('progressRing') as SVGCircleElement | null;
  if (circle) {
    circle.style.strokeDashoffset = String(offset);
    if (ringPercent === 100) {
      circle.setAttribute('stroke', '#10b981');
    } else if (ringPercent > 0) {
      circle.setAttribute('stroke', '#f59e0b');
    } else {
      circle.setAttribute('stroke', '#383842');
    }
  }

  const ringPercentText = document.getElementById('ringPercentText');
  const ringFractionText = document.getElementById('ringFractionText');
  const statusMsg = document.getElementById('ringStatusMessage');

  if (ringPercentText) ringPercentText.innerText = `${ringPercent}%`;
  if (ringFractionText) ringFractionText.innerText = `${completedToday.length}/${totalHabits}`;

  if (statusMsg) {
    if (ringPercent === 100) {
      statusMsg.innerHTML = '<span class="text-emerald-400 font-semibold flex items-center gap-1"><i data-lucide="check-circle-2" class="w-3.5 h-3.5"></i> Arc Day Conquered!</span>';
    } else if (completedToday.length === 0) {
      statusMsg.innerText = 'Begin your first morning protocol.';
    } else {
      const left = totalHabits - completedToday.length;
      statusMsg.innerText = `${left} protocol${left > 1 ? 's' : ''} left to conquer today.`;
    }
  }
}

// 14-Day Consistency Matrix
function renderMatrixGrid() {
  const container = document.getElementById('matrixGrid');
  if (!container) return;
  container.innerHTML = '';
  const todayKey = getTodayKey();
  const totalHabits = state.habits.length;

  const days: { key: string; dayName: string; dayNum: number; isToday: boolean; fullDate: Date }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const key = `${y}-${m}-${day}`;
    const dayName = d.toLocaleDateString('en-US', { weekday: 'narrow' });
    const dayNum = d.getDate();
    days.push({ key, dayName, dayNum, isToday: key === todayKey, fullDate: d });
  }

  days.forEach((day) => {
    const completed = state.history[day.key] || [];
    const count = completed.length;
    const isFull = totalHabits > 0 && count >= totalHabits;
    const isPartial = count > 0 && !isFull;

    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = `flex flex-col items-center justify-center p-2 rounded-xl border transition-all text-center group relative min-h-[58px] ${
      day.isToday
        ? 'border-amber-500/80 bg-neutral-900 shadow-md ring-1 ring-amber-500/30'
        : 'border-borderline bg-pitch hover:border-neutral-700'
    }`;

    let dotClass = 'bg-neutral-800';
    if (isFull) dotClass = 'bg-emerald-500 shadow-sm shadow-emerald-500/50';
    else if (isPartial) dotClass = 'bg-amber-500';

    cell.innerHTML = `
      <span class="text-[10px] font-mono text-neutral-500 uppercase leading-none mb-1">${day.dayName}</span>
      <span class="text-xs font-mono font-bold ${day.isToday ? 'text-amber-400' : 'text-neutral-300'}">${day.dayNum}</span>
      <span class="w-1.5 h-1.5 rounded-full ${dotClass} mt-1.5 transition-transform group-hover:scale-125"></span>
    `;

    cell.onclick = () => {
      const bar = document.getElementById('dayDetailBar');
      const text = document.getElementById('dayDetailText');
      if (bar && text) {
        bar.classList.remove('hidden');
        const formatted = day.fullDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        text.innerHTML = `<span class="font-mono text-white font-semibold">${formatted}</span>: <span class="${
          isFull ? 'text-emerald-400 font-bold' : isPartial ? 'text-amber-400' : 'text-neutral-400'
        }">${count}/${totalHabits} protocols completed</span> ${day.isToday ? '(Today)' : ''}`;
        // @ts-ignore
        if (window.lucide) window.lucide.createIcons();
      }
    };

    container.appendChild(cell);
  });
}

export function closeDayDetail() {
  const bar = document.getElementById('dayDetailBar');
  if (bar) bar.classList.add('hidden');
}

// Habit List Rendering & Interactions
function renderHabits() {
  const container = document.getElementById('habitsList');
  const emptyState = document.getElementById('emptyState');
  const emptyText = document.getElementById('emptyStateText');
  const counterEl = document.getElementById('activeHabitsCounter');
  if (!container) return;

  const completedIds = getCompletedTodayIds();
  const filteredHabits = state.habits.filter((h) => {
    const isDone = completedIds.includes(h.id);
    if (state.activeFilter === 'pending') return !isDone;
    if (state.activeFilter === 'completed') return isDone;
    return true;
  });

  if (counterEl) {
    counterEl.innerText = `${completedIds.length}/${state.habits.length} Done`;
  }

  if (filteredHabits.length === 0) {
    container.innerHTML = '';
    if (emptyState) emptyState.classList.remove('hidden');
    if (emptyText) {
      if (state.activeFilter === 'completed') {
        emptyText.innerText = 'No completed protocols yet today. Get to work.';
      } else if (state.activeFilter === 'pending') {
        emptyText.innerText = 'All protocols conquered! Perfect execution today.';
      } else {
        emptyText.innerText = 'No habits configured. Add your first protocol above.';
      }
    }
    // @ts-ignore
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');
  container.innerHTML = '';

  filteredHabits.forEach((habit) => {
    const isDone = completedIds.includes(habit.id);

    const row = document.createElement('div');
    row.className = `group flex items-center justify-between p-3.5 sm:p-4 rounded-xl border transition-all ${
      isDone
        ? 'bg-pitch/60 border-borderline/50 opacity-80'
        : 'bg-pitch border-borderline hover:border-neutral-700 hover:bg-surface-highlight/30'
    }`;

    // Left: Checkbox & text
    const leftDiv = document.createElement('div');
    leftDiv.className = 'flex items-center gap-3.5 flex-1 min-w-0 cursor-pointer select-none';
    leftDiv.onclick = (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      toggleHabit(habit.id);
    };

    const checkBtn = document.createElement('button');
    checkBtn.type = 'button';
    checkBtn.className = 'min-w-[44px] min-h-[44px] -ml-2 flex items-center justify-center rounded-lg transition-transform active:scale-90';
    checkBtn.innerHTML = `
      <div class="w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
        isDone
          ? 'bg-emerald-500 border-emerald-500 text-black shadow-sm shadow-emerald-500/40'
          : 'border-neutral-700 bg-neutral-900 group-hover:border-neutral-500 text-transparent'
      }">
        <i data-lucide="check" class="w-3.5 h-3.5 stroke-[3] ${isDone ? 'opacity-100' : 'opacity-0'}"></i>
      </div>
    `;

    const textDiv = document.createElement('div');
    textDiv.className = 'flex flex-col min-w-0 pr-2';
    textDiv.innerHTML = `
      <span class="text-sm font-semibold truncate transition-colors strike-line ${
        isDone ? 'text-neutral-500 strike-completed line-through' : 'text-neutral-100'
      }">
        ${escapeHtml(habit.title)}
      </span>
      <div class="flex items-center gap-2 text-[11px] text-neutral-500 font-mono mt-0.5">
        <span>${escapeHtml(habit.category || 'Discipline')}</span>
        ${habit.target ? `<span aria-hidden="true">·</span><span>${escapeHtml(habit.target)}</span>` : ''}
        ${habit.defaultTime ? `<span aria-hidden="true">·</span><span class="text-neutral-400"><i data-lucide="clock" class="w-3 h-3 inline mr-0.5"></i>${habit.defaultTime}</span>` : ''}
      </div>
    `;

    leftDiv.appendChild(checkBtn);
    leftDiv.appendChild(textDiv);

    // Right: Action buttons (Calendar schedule, Edit, Delete)
    const rightDiv = document.createElement('div');
    rightDiv.className = 'flex items-center gap-1 shrink-0 opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity';

    rightDiv.innerHTML = `
      <button 
        type="button" 
        onclick="window.winterArc.openScheduleHabitModal('${habit.id}')" 
        title="Schedule on Google Calendar"
        class="w-8 h-8 rounded-lg text-neutral-400 hover:text-amber-400 hover:bg-neutral-800 flex items-center justify-center transition-colors">
        <i data-lucide="calendar-plus" class="w-3.5 h-3.5"></i>
      </button>
      <button 
        type="button" 
        onclick="window.winterArc.openEditModal('${habit.id}')" 
        title="Edit Protocol"
        class="w-8 h-8 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 flex items-center justify-center transition-colors">
        <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
      </button>
      <button 
        type="button" 
        onclick="window.winterArc.deleteHabit('${habit.id}')" 
        title="Delete Protocol"
        class="w-8 h-8 rounded-lg text-neutral-400 hover:text-red-400 hover:bg-red-950/30 flex items-center justify-center transition-colors">
        <i data-lucide="trash" class="w-3.5 h-3.5"></i>
      </button>
    `;

    row.appendChild(leftDiv);
    row.appendChild(rightDiv);
    container.appendChild(row);
  });

  // @ts-ignore
  if (window.lucide) window.lucide.createIcons();
  updateMonkModeBanner();
}

export function toggleHabit(habitId: string) {
  const todayKey = getTodayKey();
  if (!state.history[todayKey]) state.history[todayKey] = [];
  const list = state.history[todayKey];
  const idx = list.indexOf(habitId);

  if (idx === -1) {
    list.push(habitId);
    if (list.length >= state.habits.length) {
      playTactileSound('conquered');
      triggerVictoryConfetti();
      showToast('Day Conquered! 100% Protocols Executed.', 'success');
    } else {
      playTactileSound('check');
      showToast('Protocol Executed', 'success');
    }
  } else {
    list.splice(idx, 1);
    playTactileSound('uncheck');
  }

  saveStorage();
  renderHabits();
  computeStreakAndStats();
  renderMatrixGrid();
}

export function setFilter(filterType: 'all' | 'pending' | 'completed') {
  state.activeFilter = filterType;
  ['filterAll', 'filterPending', 'filterCompleted'].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.className = 'px-2.5 py-1 rounded-md text-neutral-400 hover:text-white font-mono transition-colors';
  });

  const activeId = filterType === 'all' ? 'filterAll' : filterType === 'pending' ? 'filterPending' : 'filterCompleted';
  const activeBtn = document.getElementById(activeId);
  if (activeBtn) activeBtn.className = 'px-2.5 py-1 rounded-md text-white bg-surface-highlight font-mono transition-colors';

  renderHabits();
}

export function markAllComplete() {
  const todayKey = getTodayKey();
  state.history[todayKey] = state.habits.map((h) => h.id);
  saveStorage();
  playTactileSound('conquered');
  triggerVictoryConfetti();
  showToast('All daily protocols checked off!', 'success');
  renderHabits();
  computeStreakAndStats();
  renderMatrixGrid();
}

export function uncheckAllToday() {
  const todayKey = getTodayKey();
  state.history[todayKey] = [];
  saveStorage();
  playTactileSound('uncheck');
  showToast('Protocols cleared for today', 'info');
  renderHabits();
  computeStreakAndStats();
  renderMatrixGrid();
}

// Add / Edit Habit Modals
export function openAddModal() {
  const modal = document.getElementById('addModal');
  const input = document.getElementById('newHabitTitle');
  if (modal) modal.classList.remove('hidden');
  if (input) input.focus();
  // @ts-ignore
  if (window.lucide) window.lucide.createIcons();
}

export function closeAddModal() {
  const modal = document.getElementById('addModal');
  const form = document.getElementById('addHabitForm') as HTMLFormElement | null;
  if (modal) modal.classList.add('hidden');
  if (form) form.reset();
}

export function handleAddHabit(e: Event) {
  e.preventDefault();
  const titleInput = document.getElementById('newHabitTitle') as HTMLInputElement | null;
  const categoryInput = document.getElementById('newHabitCategory') as HTMLSelectElement | null;
  const targetInput = document.getElementById('newHabitTarget') as HTMLInputElement | null;
  const timeInput = document.getElementById('newHabitTime') as HTMLInputElement | null;

  const title = titleInput ? titleInput.value.trim() : '';
  const category = categoryInput ? categoryInput.value : 'Custom';
  const target = targetInput ? targetInput.value.trim() : '';
  const defaultTime = timeInput ? timeInput.value.trim() : '';

  if (!title) return;

  const newHabit: Habit = {
    id: 'hab-' + Date.now(),
    title,
    category,
    target,
    defaultTime: defaultTime || undefined,
  };

  state.habits.push(newHabit);
  saveStorage();
  closeAddModal();
  playTactileSound('check');
  showToast('New discipline protocol established', 'success');
  renderHabits();
  computeStreakAndStats();
  renderMatrixGrid();
}

export function openEditModal(habitId: string) {
  const habit = state.habits.find((h) => h.id === habitId);
  if (!habit) return;

  const idInput = document.getElementById('editHabitId') as HTMLInputElement | null;
  const titleInput = document.getElementById('editHabitTitle') as HTMLInputElement | null;
  const categoryInput = document.getElementById('editHabitCategory') as HTMLSelectElement | null;
  const targetInput = document.getElementById('editHabitTarget') as HTMLInputElement | null;
  const timeInput = document.getElementById('editHabitTime') as HTMLInputElement | null;

  if (idInput) idInput.value = habit.id;
  if (titleInput) titleInput.value = habit.title;
  if (categoryInput) categoryInput.value = habit.category || 'Physical';
  if (targetInput) targetInput.value = habit.target || '';
  if (timeInput) timeInput.value = habit.defaultTime || '';

  const modal = document.getElementById('editModal');
  if (modal) modal.classList.remove('hidden');
  if (titleInput) titleInput.focus();
  // @ts-ignore
  if (window.lucide) window.lucide.createIcons();
}

export function closeEditModal() {
  const modal = document.getElementById('editModal');
  const form = document.getElementById('editHabitForm') as HTMLFormElement | null;
  if (modal) modal.classList.add('hidden');
  if (form) form.reset();
}

export function handleEditHabit(e: Event) {
  e.preventDefault();
  const idInput = document.getElementById('editHabitId') as HTMLInputElement | null;
  const titleInput = document.getElementById('editHabitTitle') as HTMLInputElement | null;
  const categoryInput = document.getElementById('editHabitCategory') as HTMLSelectElement | null;
  const targetInput = document.getElementById('editHabitTarget') as HTMLInputElement | null;
  const timeInput = document.getElementById('editHabitTime') as HTMLInputElement | null;

  if (!idInput) return;
  const habit = state.habits.find((h) => h.id === idInput.value);
  if (!habit) return;

  habit.title = titleInput ? titleInput.value.trim() : habit.title;
  habit.category = categoryInput ? categoryInput.value : habit.category;
  habit.target = targetInput ? targetInput.value.trim() : habit.target;
  habit.defaultTime = timeInput ? timeInput.value.trim() : habit.defaultTime;

  saveStorage();
  closeEditModal();
  playTactileSound('check');
  showToast('Protocol updated', 'info');
  renderHabits();
}

export function deleteHabit(habitId: string) {
  const habit = state.habits.find((h) => h.id === habitId);
  if (!habit) return;

  if (confirm(`Remove "${habit.title}" from daily protocols?`)) {
    state.habits = state.habits.filter((h) => h.id !== habitId);
    const todayKey = getTodayKey();
    if (state.history[todayKey]) {
      state.history[todayKey] = state.history[todayKey].filter((id) => id !== habitId);
    }
    saveStorage();
    playTactileSound('uncheck');
    showToast('Protocol removed', 'info');
    renderHabits();
    computeStreakAndStats();
    renderMatrixGrid();
  }
}

export function deleteHabitFromEdit() {
  const idInput = document.getElementById('editHabitId') as HTMLInputElement | null;
  if (idInput && idInput.value) {
    const id = idInput.value;
    closeEditModal();
    deleteHabit(id);
  }
}

// Monk Mode
export function toggleMonkMode() {
  state.monkMode = !state.monkMode;
  saveStorage();
  applyMonkMode();
  playTactileSound('check');
  showToast(state.monkMode ? 'Monk Mode Engaged: Pure Focus' : 'Monk Mode Disabled', 'info');
}

function applyMonkMode() {
  const btn = document.getElementById('monkModeBtn');
  const monkBanner = document.getElementById('monkBanner');
  const quoteSec = document.getElementById('quoteSection');
  const statsSec = document.getElementById('statsSection');
  const gridSec = document.getElementById('gridSection');
  const calendarSec = document.getElementById('calendarSection');

  if (state.monkMode) {
    if (btn) {
      btn.classList.add('bg-amber-500', 'text-black', 'border-amber-400');
      btn.classList.remove('bg-surface', 'text-neutral-300');
    }
    if (monkBanner) monkBanner.classList.remove('hidden');
    if (quoteSec) quoteSec.classList.add('hidden');
    if (statsSec) statsSec.classList.add('hidden');
    if (gridSec) gridSec.classList.add('hidden');
    if (calendarSec) calendarSec.classList.add('hidden');
    updateMonkModeBanner();
  } else {
    if (btn) {
      btn.classList.remove('bg-amber-500', 'text-black', 'border-amber-400');
      btn.classList.add('bg-surface', 'text-neutral-300');
    }
    if (monkBanner) monkBanner.classList.add('hidden');
    if (quoteSec) quoteSec.classList.remove('hidden');
    if (statsSec) statsSec.classList.remove('hidden');
    if (gridSec) gridSec.classList.remove('hidden');
    if (calendarSec) calendarSec.classList.remove('hidden');
  }
  // @ts-ignore
  if (window.lucide) window.lucide.createIcons();
}

function updateMonkModeBanner() {
  if (!state.monkMode) return;
  const completedIds = getCompletedTodayIds();
  const pending = state.habits.find((h) => !completedIds.includes(h.id));
  const bannerTitle = document.getElementById('monkNextHabitTitle');
  const checkBtn = document.getElementById('monkCheckBtn') as HTMLButtonElement | null;

  if (pending) {
    if (bannerTitle) bannerTitle.innerText = `Protocol: ${pending.title}`;
    if (checkBtn) {
      checkBtn.innerText = 'Mark Protocol Conquered';
      checkBtn.disabled = false;
      checkBtn.dataset.habitId = pending.id;
    }
  } else {
    if (bannerTitle) bannerTitle.innerText = 'All Protocols Conquered Today';
    if (checkBtn) {
      checkBtn.innerText = 'Day Complete';
      checkBtn.disabled = true;
      checkBtn.dataset.habitId = '';
    }
  }
}

export function checkNextMonkHabit() {
  const btn = document.getElementById('monkCheckBtn') as HTMLButtonElement | null;
  const habitId = btn?.dataset.habitId;
  if (habitId) {
    toggleHabit(habitId);
    updateMonkModeBanner();
  }
}

// Audio Toggle
export function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  saveStorage();
  updateSoundUI();
  if (state.soundEnabled) playTactileSound('check');
  showToast(state.soundEnabled ? 'Tactile Sound Enabled' : 'Muted', 'info');
}

function updateSoundUI() {
  const icon = document.getElementById('soundIcon');
  if (icon) {
    icon.setAttribute('data-lucide', state.soundEnabled ? 'volume-2' : 'volume-x');
    // @ts-ignore
    if (window.lucide) window.lucide.createIcons();
  }
}

// Menu and Reset
export function toggleMenu() {
  const menu = document.getElementById('dropdownMenu');
  if (menu) menu.classList.toggle('hidden');
}

export function confirmResetDay() {
  const menu = document.getElementById('dropdownMenu');
  if (menu) menu.classList.add('hidden');
  const modal = document.getElementById('resetModal');
  if (modal) modal.classList.remove('hidden');
  // @ts-ignore
  if (window.lucide) window.lucide.createIcons();
}

export function closeResetModal() {
  const modal = document.getElementById('resetModal');
  if (modal) modal.classList.add('hidden');
}

export function executeResetToday() {
  const todayKey = getTodayKey();
  state.history[todayKey] = [];
  saveStorage();
  closeResetModal();
  playTactileSound('uncheck');
  showToast("Today's checklist reset", 'warning');
  renderHabits();
  computeStreakAndStats();
  renderMatrixGrid();
}

export function exportData() {
  const menu = document.getElementById('dropdownMenu');
  if (menu) menu.classList.add('hidden');
  const exportObj = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    habits: state.habits,
    history: state.history,
  };
  const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `winter-arc-log-${getTodayKey()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Habit logs exported to JSON', 'success');
}

export function importData(event: Event) {
  const menu = document.getElementById('dropdownMenu');
  if (menu) menu.classList.add('hidden');
  const target = event.target as HTMLInputElement;
  const file = target.files && target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const data = JSON.parse(e.target?.result as string);
      if (data.habits && Array.isArray(data.habits)) {
        state.habits = data.habits;
      }
      if (data.history && typeof data.history === 'object') {
        state.history = data.history;
      }
      saveStorage();
      playTactileSound('conquered');
      showToast('Backup restored successfully!', 'success');
      renderHabits();
      computeStreakAndStats();
      renderMatrixGrid();
    } catch (err) {
      showToast('Invalid backup JSON file', 'warning');
    }
  };
  reader.readAsText(file);
}

// -------------------------------------------------------------
// GOOGLE CALENDAR & AUTHENTICATION INTEGRATION
// -------------------------------------------------------------

export async function handleGoogleSignIn() {
  try {
    showToast('Connecting to Google...', 'info');
    const result = await googleSignIn();
    if (result) {
      state.currentUser = result.user;
      showToast(`Connected as ${result.user.displayName || result.user.email}`, 'success');
      updateAuthUI();
      loadCalendarEvents();
    }
  } catch (err: any) {
    console.error('Sign in failed:', err);
    if (err.message && err.message.includes('identity-toolkit-api-has-not-been-used')) {
      showToast('Firebase Auth API not enabled yet in Google Cloud. Click the link in console to enable.', 'warning');
    } else if (err.code === 'auth/popup-closed-by-user') {
      showToast('Sign-in popup closed before completion.', 'info');
    } else {
      showToast(err.message || 'Google Sign-in failed', 'warning');
    }
  }
}

export async function handleGoogleLogout() {
  try {
    await logout();
    state.currentUser = null;
    state.calendarEvents = [];
    showToast('Signed out of Google Calendar', 'info');
    updateAuthUI();
    renderCalendarEvents();
  } catch (err: any) {
    console.error('Logout error:', err);
  }
}

function updateAuthUI() {
  const container = document.getElementById('authArea');
  const calendarSection = document.getElementById('calendarSection');
  if (!container) return;

  if (state.currentUser) {
    // Authenticated state
    const avatar = state.currentUser.photoURL || '';
    const name = state.currentUser.displayName || state.currentUser.email || 'User';

    container.innerHTML = `
      <div class="flex items-center gap-2 bg-surface border border-borderline py-1 px-2.5 rounded-lg text-xs">
        ${
          avatar
            ? `<img src="${avatar}" class="w-5 h-5 rounded-full object-cover border border-neutral-700" alt="${name}" referrerpolicy="no-referrer">`
            : `<div class="w-5 h-5 rounded-full bg-neutral-800 text-amber-400 font-mono text-[10px] flex items-center justify-center font-bold">G</div>`
        }
        <span class="text-neutral-200 font-medium truncate max-w-[110px] sm:max-w-[140px]">${escapeHtml(name)}</span>
        <button 
          onclick="window.winterArc.handleGoogleLogout()" 
          title="Disconnect Google Account" 
          class="text-neutral-400 hover:text-white ml-1 p-0.5 rounded hover:bg-neutral-800 transition-colors">
          <i data-lucide="log-out" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    `;
    if (calendarSection) calendarSection.classList.remove('hidden');
  } else {
    // Sign In With Google standard button
    container.innerHTML = `
      <button 
        onclick="window.winterArc.handleGoogleSignIn()" 
        class="h-9 px-3 rounded-lg border border-borderline bg-surface hover:bg-surface-highlight text-neutral-200 text-xs font-medium flex items-center gap-2 transition-all active:scale-95 shadow-sm">
        <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
        </svg>
        <span class="hidden sm:inline">Connect Calendar</span>
        <span class="sm:hidden">Calendar</span>
      </button>
    `;
  }

  // @ts-ignore
  if (window.lucide) window.lucide.createIcons();
}

export async function loadCalendarEvents() {
  const token = await getAccessToken();
  if (!token) return;

  state.isCalendarLoading = true;
  state.calendarError = null;
  renderCalendarEvents();

  try {
    const events = await listTodayEvents(token);
    state.calendarEvents = events;
  } catch (err: any) {
    console.error('Error fetching calendar events:', err);
    state.calendarError = err.message || 'Failed to load Google Calendar events';
  } finally {
    state.isCalendarLoading = false;
    renderCalendarEvents();
  }
}

function renderCalendarEvents() {
  const listContainer = document.getElementById('calendarEventsList');
  const countBadge = document.getElementById('calendarEventsBadge');
  if (!listContainer) return;

  if (state.isCalendarLoading) {
    listContainer.innerHTML = `
      <div class="py-6 text-center text-xs font-mono text-neutral-500 flex items-center justify-center gap-2">
        <i data-lucide="loader-2" class="w-4 h-4 animate-spin text-amber-500"></i>
        <span>Loading events from Google Calendar...</span>
      </div>
    `;
    // @ts-ignore
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  if (state.calendarError) {
    listContainer.innerHTML = `
      <div class="py-4 text-center text-xs text-amber-400 font-mono space-y-2">
        <p>${escapeHtml(state.calendarError)}</p>
        <button onclick="window.winterArc.loadCalendarEvents()" class="px-3 py-1 rounded bg-neutral-900 border border-borderline hover:bg-neutral-800 text-neutral-200">Retry</button>
      </div>
    `;
    return;
  }

  if (countBadge) {
    countBadge.innerText = `${state.calendarEvents.length} Event${state.calendarEvents.length === 1 ? '' : 's'}`;
  }

  if (state.calendarEvents.length === 0) {
    listContainer.innerHTML = `
      <div class="py-6 text-center text-xs font-mono text-neutral-500">
        No Google Calendar events scheduled for today. Sync your Winter Arc protocols below to block time!
      </div>
    `;
    return;
  }

  listContainer.innerHTML = '';
  state.calendarEvents.forEach((ev) => {
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between p-3 rounded-xl border border-borderline bg-pitch hover:border-neutral-700 transition-colors';

    let timeDisplay = 'All Day';
    if (ev.start.dateTime) {
      const start = new Date(ev.start.dateTime);
      const end = ev.end.dateTime ? new Date(ev.end.dateTime) : null;
      const startStr = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      const endStr = end ? end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';
      timeDisplay = `${startStr} – ${endStr}`;
    }

    row.innerHTML = `
      <div class="flex items-center gap-3 min-w-0 pr-3">
        <div class="w-2 h-2 rounded-full bg-amber-500 shrink-0"></div>
        <div class="min-w-0">
          <div class="text-xs font-semibold text-neutral-200 truncate">${escapeHtml(ev.summary || '(Untitled Event)')}</div>
          <div class="text-[11px] font-mono text-neutral-500">${escapeHtml(timeDisplay)}</div>
        </div>
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        ${
          ev.htmlLink
            ? `<a href="${ev.htmlLink}" target="_blank" rel="noopener noreferrer" title="Open in Google Calendar" class="w-7 h-7 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 flex items-center justify-center transition-colors">
                <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
              </a>`
            : ''
        }
        <button 
          onclick="window.winterArc.confirmDeleteEvent('${ev.id}', '${escapeHtml(ev.summary || 'Event')}')" 
          title="Delete from Google Calendar"
          class="w-7 h-7 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-950/30 flex items-center justify-center transition-colors">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    `;

    listContainer.appendChild(row);
  });

  // @ts-ignore
  if (window.lucide) window.lucide.createIcons();
}

// -------------------------------------------------------------
// USER CONFIRMATION MODALS FOR WORKSPACE MUTATIONS (MANDATORY)
// -------------------------------------------------------------

// 1. Confirm Bulk Sync Daily Protocols to Google Calendar
export function initiateCalendarSync() {
  if (!state.currentUser) {
    showToast('Please connect your Google Calendar first', 'warning');
    handleGoogleSignIn();
    return;
  }

  pendingCalendarSync = {
    habitsToSync: state.habits,
    date: getTodayKey(),
  };

  const modal = document.getElementById('calendarSyncModal');
  const listEl = document.getElementById('syncHabitsPreviewList');
  const countEl = document.getElementById('syncHabitsCountText');

  if (countEl) countEl.innerText = `${state.habits.length} protocols`;

  if (listEl) {
    listEl.innerHTML = '';
    state.habits.forEach((h, index) => {
      // Default suggested time schedule: e.g. 05:00, 06:30, 09:00, 12:30, 21:30
      const defaultTimes = ['05:00 AM', '06:30 AM', '09:00 AM', '12:30 PM', '09:00 PM'];
      const timeSuggestion = h.defaultTime || defaultTimes[index % defaultTimes.length];

      const item = document.createElement('div');
      item.className = 'flex items-center justify-between text-xs py-1.5 border-b border-borderline/50';
      item.innerHTML = `
        <span class="text-neutral-200 font-medium truncate pr-2">${escapeHtml(h.title)}</span>
        <span class="text-amber-400 font-mono text-[11px] shrink-0">${timeSuggestion}</span>
      `;
      listEl.appendChild(item);
    });
  }

  if (modal) modal.classList.remove('hidden');
  // @ts-ignore
  if (window.lucide) window.lucide.createIcons();
}

export function closeCalendarSyncModal() {
  const modal = document.getElementById('calendarSyncModal');
  if (modal) modal.classList.add('hidden');
  pendingCalendarSync = null;
}

export async function executeCalendarSync() {
  if (!pendingCalendarSync) return;
  const token = await getAccessToken();
  if (!token) {
    showToast('Authentication token missing. Please sign in.', 'warning');
    closeCalendarSyncModal();
    return;
  }

  const { habitsToSync } = pendingCalendarSync;
  closeCalendarSyncModal();
  showToast(`Scheduling ${habitsToSync.length} protocols to Google Calendar...`, 'info');

  try {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');

    // Create time-blocked events
    for (let i = 0; i < habitsToSync.length; i++) {
      const habit = habitsToSync[i];
      let timeHour = 5 + i * 2; // Default staggered hour
      let timeMinute = 0;

      if (habit.defaultTime && habit.defaultTime.includes(':')) {
        const parts = habit.defaultTime.split(':');
        timeHour = parseInt(parts[0], 10);
        timeMinute = parseInt(parts[1], 10);
      }

      const start = new Date(y, today.getMonth(), today.getDate(), timeHour, timeMinute, 0);
      const end = new Date(start.getTime() + 45 * 60 * 1000); // 45 minute duration

      await createCalendarEvent(token, {
        summary: `[Winter Arc] ${habit.title}`,
        description: `Winter Arc Non-Negotiable Protocol.\nCategory: ${habit.category}\nTarget: ${habit.target || 'Execution'}`,
        startDateTime: start.toISOString(),
        endDateTime: end.toISOString(),
      });
    }

    playTactileSound('conquered');
    showToast(`Successfully scheduled ${habitsToSync.length} protocols on your Google Calendar!`, 'success');
    loadCalendarEvents();
  } catch (err: any) {
    console.error('Failed to sync to calendar:', err);
    showToast(err.message || 'Failed to sync events to Google Calendar', 'warning');
  }
}

// 2. Schedule a Single Protocol to Google Calendar
export function openScheduleHabitModal(habitId: string) {
  if (!state.currentUser) {
    showToast('Please connect your Google Calendar first', 'warning');
    handleGoogleSignIn();
    return;
  }

  const habit = state.habits.find((h) => h.id === habitId);
  if (!habit) return;
  pendingScheduleHabit = habit;

  const modal = document.getElementById('singleScheduleModal');
  const titleEl = document.getElementById('singleScheduleTitle');
  const timeInput = document.getElementById('singleScheduleTime') as HTMLInputElement | null;
  const dateInput = document.getElementById('singleScheduleDate') as HTMLInputElement | null;

  if (titleEl) titleEl.innerText = habit.title;
  if (timeInput) timeInput.value = habit.defaultTime || '07:00';
  if (dateInput) dateInput.value = getTodayKey();

  if (modal) modal.classList.remove('hidden');
  // @ts-ignore
  if (window.lucide) window.lucide.createIcons();
}

export function closeScheduleHabitModal() {
  const modal = document.getElementById('singleScheduleModal');
  if (modal) modal.classList.add('hidden');
  pendingScheduleHabit = null;
}

export async function executeScheduleSingleHabit(e: Event) {
  e.preventDefault();
  if (!pendingScheduleHabit) return;

  const token = await getAccessToken();
  if (!token) {
    showToast('Authentication token missing. Please sign in.', 'warning');
    closeScheduleHabitModal();
    return;
  }

  const dateInput = document.getElementById('singleScheduleDate') as HTMLInputElement | null;
  const timeInput = document.getElementById('singleScheduleTime') as HTMLInputElement | null;
  const durationInput = document.getElementById('singleScheduleDuration') as HTMLSelectElement | null;

  const dateStr = dateInput?.value || getTodayKey();
  const timeStr = timeInput?.value || '07:00';
  const durationMins = durationInput ? parseInt(durationInput.value, 10) : 45;

  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);

  const start = new Date(year, month - 1, day, hour, minute, 0);
  const end = new Date(start.getTime() + durationMins * 60 * 1000);

  const habit = pendingScheduleHabit;
  closeScheduleHabitModal();
  showToast(`Adding "${habit.title}" to Google Calendar...`, 'info');

  try {
    await createCalendarEvent(token, {
      summary: `[Winter Arc] ${habit.title}`,
      description: `Winter Arc Protocol: ${habit.title}\nCategory: ${habit.category}\nTarget: ${habit.target || 'Execution'}`,
      startDateTime: start.toISOString(),
      endDateTime: end.toISOString(),
    });

    playTactileSound('check');
    showToast(`Scheduled on Google Calendar for ${timeStr}`, 'success');
    loadCalendarEvents();
  } catch (err: any) {
    console.error('Error creating event:', err);
    showToast(err.message || 'Failed to create calendar event', 'warning');
  }
}

// 3. Confirm Delete Calendar Event Dialog
export function confirmDeleteEvent(eventId: string, summary: string) {
  pendingEventDelete = { eventId, summary };
  const modal = document.getElementById('deleteEventModal');
  const textEl = document.getElementById('deleteEventText');
  if (textEl) textEl.innerText = `Remove "${summary}" from your Google Calendar?`;
  if (modal) modal.classList.remove('hidden');
  // @ts-ignore
  if (window.lucide) window.lucide.createIcons();
}

export function closeDeleteEventModal() {
  const modal = document.getElementById('deleteEventModal');
  if (modal) modal.classList.add('hidden');
  pendingEventDelete = null;
}

export async function executeDeleteEvent() {
  if (!pendingEventDelete) return;
  const token = await getAccessToken();
  if (!token) return;

  const { eventId, summary } = pendingEventDelete;
  closeDeleteEventModal();
  showToast(`Removing "${summary}"...`, 'info');

  try {
    await deleteCalendarEvent(token, eventId);
    playTactileSound('uncheck');
    showToast('Event removed from Google Calendar', 'success');
    loadCalendarEvents();
  } catch (err: any) {
    console.error('Error deleting event:', err);
    showToast(err.message || 'Failed to delete event', 'warning');
  }
}

// 4. Milestone Event: Jan 1 Winter Arc Completion
export async function scheduleJan1Milestone() {
  if (!state.currentUser) {
    showToast('Please connect your Google Calendar first', 'warning');
    handleGoogleSignIn();
    return;
  }

  const token = await getAccessToken();
  if (!token) return;

  const confirmed = confirm(
    'Schedule the "Winter Arc Rebirth & Completion" celebration event on January 1st, 2027 in your Google Calendar?'
  );
  if (!confirmed) return;

  try {
    const targetYear = new Date().getMonth() >= 9 ? new Date().getFullYear() + 1 : new Date().getFullYear();
    const start = new Date(targetYear, 0, 1, 9, 0, 0);
    const end = new Date(targetYear, 0, 1, 10, 0, 0);

    await createCalendarEvent(token, {
      summary: '🏆 Winter Arc Completion: 92 Days Conquered',
      description: 'Culmination of the Winter Arc. Reflection, celebration, and entry into the new year with forged discipline.',
      startDateTime: start.toISOString(),
      endDateTime: end.toISOString(),
    });

    playTactileSound('conquered');
    showToast('Milestone scheduled on January 1st in Google Calendar!', 'success');
    loadCalendarEvents();
  } catch (err: any) {
    showToast(err.message || 'Failed to schedule milestone', 'warning');
  }
}

// -------------------------------------------------------------
// APPLICATION BOOTSTRAP
// -------------------------------------------------------------

export function initApp() {
  loadStorage();

  const d = new Date();
  const formattedDate = d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase();
  const dateNavEl = document.getElementById('currentDateNav');
  if (dateNavEl) dateNavEl.innerText = formattedDate;

  initCountdown();
  renderQuote();
  renderHabits();
  computeStreakAndStats();
  renderMatrixGrid();
  updateSoundUI();
  applyMonkMode();

  // Initialize Firebase Auth listener
  initAuth(
    (user, token) => {
      state.currentUser = user;
      updateAuthUI();
      if (token) {
        loadCalendarEvents();
      }
    },
    () => {
      state.currentUser = null;
      updateAuthUI();
      renderCalendarEvents();
    }
  );

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('dropdownMenu');
    const btn = document.getElementById('menuBtn');
    if (menu && btn && !menu.contains(e.target as Node) && !btn.contains(e.target as Node)) {
      menu.classList.add('hidden');
    }
  });

  // @ts-ignore
  if (window.lucide) window.lucide.createIcons();
}

export async function consultAiCoach() {
  const btn = document.getElementById('consultCoachBtn') as HTMLButtonElement | null;
  const outputEl = document.getElementById('aiCoachText');
  const badgeEl = document.getElementById('aiCoachBadge');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i><span>Analyzing...</span>`;
    // @ts-ignore
    if (window.lucide) window.lucide.createIcons();
  }

  if (badgeEl) {
    badgeEl.innerText = 'Evaluating';
    badgeEl.className = 'text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse';
  }

  const completedToday = getCompletedTodayIds();
  const habitsCount = state.habits.length;
  const pending = state.habits
    .filter((h) => !completedToday.includes(h.id))
    .map((h) => h.title);

  // Compute days remaining
  const now = new Date();
  const targetYear = now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear();
  const targetDate = new Date(targetYear, 0, 1, 0, 0, 0);
  const diffDays = Math.max(0, Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 3600 * 24)));

  try {
    const streakVal = Number(document.getElementById('currentStreakVal')?.innerText) || 0;
    const res = await fetch('/api/ai/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        streak: streakVal,
        todayCompleted: completedToday.length,
        todayTotal: habitsCount,
        pendingHabits: pending,
        daysRemaining: diffDays,
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (outputEl) {
      outputEl.innerText = `"${data.message}"`;
      outputEl.classList.add('text-white', 'font-medium');
    }

    if (badgeEl) {
      const isGemini = data.source === 'gemini';
      badgeEl.innerText = isGemini ? 'Gemini AI Verified' : 'Stoic Verdict';
      badgeEl.className = isGemini
        ? 'text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
        : 'text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40';
    }

    playTactileSound('check');
    showToast('AI Coach Verdict received', 'success');
  } catch (err: any) {
    if (outputEl) {
      outputEl.innerText = `"Excuses are for the weak. You have ${pending.length} protocols left today. Execute now without hesitation."`;
    }
    if (badgeEl) {
      badgeEl.innerText = 'Stoic Standby';
      badgeEl.className = 'text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 border border-neutral-700';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="zap" class="w-3.5 h-3.5"></i><span>Get Daily Verdict</span>`;
      // @ts-ignore
      if (window.lucide) window.lucide.createIcons();
    }
  }
}

// Attach functions to window for onclick handlers
declare global {
  interface Window {
    winterArc: any;
    lucide: any;
  }
}

window.winterArc = {
  shuffleQuote,
  consultAiCoach,
  toggleHabit,
  setFilter,
  markAllComplete,
  uncheckAllToday,
  openAddModal,
  closeAddModal,
  handleAddHabit,
  openEditModal,
  closeEditModal,
  handleEditHabit,
  deleteHabit,
  deleteHabitFromEdit,
  toggleMonkMode,
  checkNextMonkHabit,
  toggleSound,
  toggleMenu,
  confirmResetDay,
  closeResetModal,
  executeResetToday,
  exportData,
  importData,
  closeDayDetail,
  handleGoogleSignIn,
  handleGoogleLogout,
  loadCalendarEvents,
  initiateCalendarSync,
  closeCalendarSyncModal,
  executeCalendarSync,
  openScheduleHabitModal,
  closeScheduleHabitModal,
  executeScheduleSingleHabit,
  confirmDeleteEvent,
  closeDeleteEventModal,
  executeDeleteEvent,
  scheduleJan1Milestone,
  triggerVictoryConfetti,
};

window.addEventListener('DOMContentLoaded', initApp);
