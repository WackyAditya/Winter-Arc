import fs from 'fs';
import path from 'path';
import { AppState, Habit, AnalyticsSummary } from './types';
import { connectMongo, AppStateModel } from './db';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'winter_arc_db.json');

const DEFAULT_HABITS: Habit[] = [
  { id: 'hab-1', title: '05:00 AM Wakeup / Cold Start', category: 'Routine', target: '05:00 AM', defaultTime: '05:00' },
  { id: 'hab-2', title: 'Heavy Training / 10k Steps', category: 'Physical', target: '60+ min', defaultTime: '06:30' },
  { id: 'hab-3', title: 'Clean Nutrition (Zero Refined Sugar)', category: 'Nutrition', target: '100% Clean', defaultTime: '12:30' },
  { id: 'hab-4', title: 'Deep Work / Coding & Problem Solving (2+ hrs)', category: 'Focus', target: '2.5 hrs', defaultTime: '09:00' },
  { id: 'hab-5', title: 'No Screen Time 1 hr Before Sleep', category: 'Recovery', target: '9:30 PM', defaultTime: '21:30' },
];

const INITIAL_STATE: AppState = {
  habits: DEFAULT_HABITS,
  history: {},
  soundEnabled: true,
  monkMode: false,
  lastUpdated: new Date().toISOString(),
};

function ensureDbFile(): AppState {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(INITIAL_STATE, null, 2), 'utf-8');
    return INITIAL_STATE;
  }

  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      habits: Array.isArray(parsed.habits) && parsed.habits.length > 0 ? parsed.habits : DEFAULT_HABITS,
      history: parsed.history && typeof parsed.history === 'object' ? parsed.history : {},
      soundEnabled: typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : true,
      monkMode: typeof parsed.monkMode === 'boolean' ? parsed.monkMode : false,
      lastUpdated: parsed.lastUpdated || new Date().toISOString(),
    };
  } catch (err) {
    console.error('Error reading database file, recovering with default state:', err);
    return INITIAL_STATE;
  }
}

export class JsonStorage {
  private state: AppState;
  private isMongoConnected: boolean = false;

  constructor() {
    this.state = ensureDbFile();
    this.initMongoSync();
  }

  private async initMongoSync() {
    this.isMongoConnected = await connectMongo();
    if (this.isMongoConnected) {
      try {
        const existingDoc = await AppStateModel.findOne({ key: 'global_state' });
        if (existingDoc && existingDoc.habits && existingDoc.habits.length > 0) {
          this.state.habits = existingDoc.habits;
          this.state.history = existingDoc.history || {};
          if (typeof existingDoc.soundEnabled === 'boolean') this.state.soundEnabled = existingDoc.soundEnabled;
          if (typeof existingDoc.monkMode === 'boolean') this.state.monkMode = existingDoc.monkMode;
          this.state.lastUpdated = existingDoc.lastUpdated || new Date().toISOString();
          console.log('📦 Hydrated state from MongoDB Atlas.');
        } else {
          // Push initial data to MongoDB
          await AppStateModel.findOneAndUpdate(
            { key: 'global_state' },
            { key: 'global_state', ...this.state },
            { upsert: true }
          );
          console.log('🚀 Uploaded initial state to MongoDB Atlas.');
        }
      } catch (err: any) {
        console.warn('⚠️ Error during initial MongoDB sync:', err.message);
      }
    }
  }

  isMongoActive(): boolean {
    return this.isMongoConnected;
  }

  private persist() {
    this.state.lastUpdated = new Date().toISOString();
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tempFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(this.state, null, 2), 'utf-8');
    fs.renameSync(tempFile, DB_FILE);

    // Sync to MongoDB if connected
    if (this.isMongoConnected) {
      AppStateModel.findOneAndUpdate(
        { key: 'global_state' },
        { key: 'global_state', ...this.state },
        { upsert: true }
      ).catch((err: any) => {
        console.warn('⚠️ Background sync to MongoDB failed:', err.message);
      });
    }
  }

  getState(): AppState {
    return { ...this.state };
  }

  setState(newState: Partial<AppState>): AppState {
    if (Array.isArray(newState.habits)) {
      this.state.habits = newState.habits;
    }
    if (newState.history && typeof newState.history === 'object') {
      this.state.history = newState.history;
    }
    if (typeof newState.soundEnabled === 'boolean') {
      this.state.soundEnabled = newState.soundEnabled;
    }
    if (typeof newState.monkMode === 'boolean') {
      this.state.monkMode = newState.monkMode;
    }
    this.persist();
    return this.getState();
  }

  getHabits(): Habit[] {
    return [...this.state.habits];
  }

  createHabit(habitData: Omit<Habit, 'id'> & { id?: string }): Habit {
    const id = habitData.id || `hab-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const newHabit: Habit = {
      ...habitData,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.state.habits.push(newHabit);
    this.persist();
    return newHabit;
  }

  updateHabit(id: string, updates: Partial<Omit<Habit, 'id'>>): Habit | null {
    const index = this.state.habits.findIndex((h) => h.id === id);
    if (index === -1) return null;

    this.state.habits[index] = {
      ...this.state.habits[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.persist();
    return this.state.habits[index];
  }

  deleteHabit(id: string): boolean {
    const initialLen = this.state.habits.length;
    this.state.habits = this.state.habits.filter((h) => h.id !== id);

    // Also remove from history
    for (const date in this.state.history) {
      if (Array.isArray(this.state.history[date])) {
        this.state.history[date] = this.state.history[date].filter((hId) => hId !== id);
      }
    }

    if (this.state.habits.length !== initialLen) {
      this.persist();
      return true;
    }
    return false;
  }

  toggleHabit(date: string, habitId: string): { completed: boolean; completedList: string[] } {
    if (!this.state.history[date]) {
      this.state.history[date] = [];
    }

    const list = this.state.history[date];
    const index = list.indexOf(habitId);
    let completed = false;

    if (index > -1) {
      list.splice(index, 1);
      completed = false;
    } else {
      list.push(habitId);
      completed = true;
    }

    this.persist();
    return { completed, completedList: list };
  }

  resetDay(date: string): string[] {
    this.state.history[date] = [];
    this.persist();
    return [];
  }

  computeAnalytics(): AnalyticsSummary {
    const habitsCount = this.state.habits.length;
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const todayCompleted = this.state.history[todayStr] || [];

    // Calculate streaks
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;

    // Winter Arc ends Jan 1 of next year
    const winterArcTarget = new Date(today.getFullYear() + (today.getMonth() >= 9 ? 1 : 0), 0, 1);
    const diffTime = winterArcTarget.getTime() - today.getTime();
    const daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    // Scan backwards from today for current streak
    let checkDate = new Date(today);
    let isTodayChecked = (todayCompleted.length / Math.max(1, habitsCount)) >= 0.8;
    
    // If today is not yet 80% complete, start checking from yesterday so active streak is not prematurely lost
    if (!isTodayChecked) {
      checkDate.setDate(checkDate.getDate() - 1);
    }

    for (let i = 0; i < 90; i++) {
      const dateKey = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
      const completedOnDate = (this.state.history[dateKey] || []).length;
      const ratio = completedOnDate / Math.max(1, habitsCount);

      if (ratio >= 0.75) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    // Longest streak calculation across all recorded history
    const sortedDates = Object.keys(this.state.history).sort();
    tempStreak = 0;
    let prevDateTime: number | null = null;

    for (const d of sortedDates) {
      const completedOnDate = this.state.history[d].length;
      const ratio = completedOnDate / Math.max(1, habitsCount);

      if (ratio >= 0.75) {
        const currentDateTime = new Date(d).getTime();
        if (prevDateTime !== null) {
          const diffDays = Math.round((currentDateTime - prevDateTime) / (1000 * 3600 * 24));
          if (diffDays === 1) {
            tempStreak++;
          } else {
            tempStreak = 1;
          }
        } else {
          tempStreak = 1;
        }
        prevDateTime = currentDateTime;
        if (tempStreak > longestStreak) longestStreak = tempStreak;
      } else {
        tempStreak = 0;
        prevDateTime = null;
      }
    }

    longestStreak = Math.max(longestStreak, currentStreak);

    let totalCompletions = 0;
    for (const d in this.state.history) {
      totalCompletions += this.state.history[d].length;
    }

    return {
      currentStreak,
      longestStreak,
      totalCompletions,
      todayCompletedCount: todayCompleted.length,
      todayTotalCount: habitsCount,
      todayPercent: habitsCount > 0 ? Math.round((todayCompleted.length / habitsCount) * 100) : 0,
      monkModeDays: currentStreak,
      daysRemainingInWinterArc: daysRemaining,
      startDate: `${today.getFullYear()}-10-01`,
      targetDate: `${today.getFullYear() + (today.getMonth() >= 9 ? 1 : 0)}-01-01`,
    };
  }
}

export const storage = new JsonStorage();
