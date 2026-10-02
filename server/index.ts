import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { storage } from './storage';
import { generateDisciplineAdvice } from './aiCoach';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json());

// Request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} -> ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  const state = storage.getState();
  const mongoActive = storage.isMongoActive();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    database: {
      type: mongoActive ? 'mongodb_atlas' : 'json_file',
      mongoConnected: mongoActive,
      habitsCount: state.habits.length,
      historyDaysCount: Object.keys(state.history).length,
      lastUpdated: state.lastUpdated,
    },
    aiCoachConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
  });
});

// State Endpoints
app.get('/api/state', (_req: Request, res: Response) => {
  try {
    const state = storage.getState();
    res.json(state);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve state', message: err.message });
  }
});

app.put('/api/state', (req: Request, res: Response) => {
  try {
    const updated = storage.setState(req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update state', message: err.message });
  }
});

// Habit Endpoints
app.get('/api/habits', (_req: Request, res: Response) => {
  res.json(storage.getHabits());
});

app.post('/api/habits', (req: Request, res: Response) => {
  try {
    const { title, category, target, defaultTime } = req.body;
    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'Habit title is required' });
    }

    const created = storage.createHabit({
      title: title.trim(),
      category: (category || 'Discipline').trim(),
      target: target ? String(target).trim() : undefined,
      defaultTime: defaultTime ? String(defaultTime).trim() : undefined,
    });
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create habit', message: err.message });
  }
});

app.put('/api/habits/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, category, target, defaultTime } = req.body;

    const updated = storage.updateHabit(id, {
      ...(title !== undefined && { title: String(title).trim() }),
      ...(category !== undefined && { category: String(category).trim() }),
      ...(target !== undefined && { target: String(target).trim() }),
      ...(defaultTime !== undefined && { defaultTime: String(defaultTime).trim() }),
    });

    if (!updated) {
      return res.status(404).json({ error: `Habit with id '${id}' not found` });
    }

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update habit', message: err.message });
  }
});

app.delete('/api/habits/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = storage.deleteHabit(id);
    if (!deleted) {
      return res.status(404).json({ error: `Habit with id '${id}' not found` });
    }
    res.json({ success: true, message: `Habit '${id}' removed from protocol` });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete habit', message: err.message });
  }
});

// Toggle Habit Completion for a Specific Date
app.post('/api/habits/:id/toggle', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const today = new Date();
    const defaultDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const date = (req.body.date as string) || defaultDate;

    const result = storage.toggleHabit(date, id);
    res.json({
      date,
      habitId: id,
      completed: result.completed,
      completedToday: result.completedList,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to toggle habit', message: err.message });
  }
});

// Reset Day Endpoint
app.post('/api/history/reset-today', (req: Request, res: Response) => {
  try {
    const today = new Date();
    const defaultDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const date = (req.body.date as string) || defaultDate;

    const cleared = storage.resetDay(date);
    res.json({ success: true, date, clearedList: cleared });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to reset date history', message: err.message });
  }
});

// Analytics Endpoint
app.get('/api/analytics', (_req: Request, res: Response) => {
  try {
    const stats = storage.computeAnalytics();
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to compute analytics', message: err.message });
  }
});

// AI Discipline Coach Endpoint
app.post('/api/ai/coach', async (req: Request, res: Response) => {
  try {
    const advice = await generateDisciplineAdvice(req.body);
    res.json(advice);
  } catch (err: any) {
    res.status(500).json({ error: 'AI Coach generation failed', message: err.message });
  }
});

// Backup Export & Import Endpoints
app.get('/api/backup/export', (_req: Request, res: Response) => {
  const state = storage.getState();
  const payload = {
    appName: 'Winter Arc Discipline Protocol',
    version: '2.0.0',
    exportedAt: new Date().toISOString(),
    habits: state.habits,
    history: state.history,
    soundEnabled: state.soundEnabled,
    monkMode: state.monkMode,
  };
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=winter-arc-backup-${Date.now()}.json`);
  res.send(JSON.stringify(payload, null, 2));
});

app.post('/api/backup/import', (req: Request, res: Response) => {
  try {
    const { habits, history, soundEnabled, monkMode } = req.body;
    if (!Array.isArray(habits)) {
      return res.status(400).json({ error: 'Invalid backup file: habits array is missing' });
    }

    const updated = storage.setState({
      habits,
      history: typeof history === 'object' ? history : {},
      soundEnabled: typeof soundEnabled === 'boolean' ? soundEnabled : true,
      monkMode: typeof monkMode === 'boolean' ? monkMode : false,
    });

    res.json({ success: true, state: updated });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to import backup', message: err.message });
  }
});

// Serve frontend build if dist folder exists
import path from 'path';
import fs from 'fs';

const distPath = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(`⚡ Winter Arc Backend running on http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  console.log(`   State:  http://localhost:${PORT}/api/state`);
  console.log(`   Habits: http://localhost:${PORT}/api/habits`);
  console.log(`===============================================`);
});
