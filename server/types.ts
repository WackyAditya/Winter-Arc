export interface Habit {
  id: string;
  title: string;
  category: string;
  target?: string;
  defaultTime?: string; // e.g. "05:00", "06:30", "09:00"
  createdAt?: string;
  updatedAt?: string;
}

export interface AppState {
  habits: Habit[];
  history: Record<string, string[]>; // YYYY-MM-DD -> array of completed habit IDs
  soundEnabled: boolean;
  monkMode: boolean;
  lastUpdated?: string;
}

export interface AnalyticsSummary {
  currentStreak: number;
  longestStreak: number;
  totalCompletions: number;
  todayCompletedCount: number;
  todayTotalCount: number;
  todayPercent: number;
  monkModeDays: number;
  daysRemainingInWinterArc: number;
  startDate: string;
  targetDate: string;
}

export interface CoachRequest {
  streak?: number;
  todayCompleted?: number;
  todayTotal?: number;
  pendingHabits?: string[];
  daysRemaining?: number;
  userMessage?: string;
}

export interface CoachResponse {
  message: string;
  intensity: 'monk' | 'stoic' | 'warrior';
  timestamp: string;
  source: 'gemini' | 'fallback';
}
