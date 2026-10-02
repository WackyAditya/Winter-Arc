import { GoogleGenAI } from '@google/genai';
import { CoachRequest, CoachResponse } from './types';

const FALLBACK_DISCIPLINE_MANTRAS = [
  "The cold does not negotiate, and neither do you. Every rep, every page, every second of deep work builds the steel armor you wear into the new year.",
  "You don't need motivation when you have relentless discipline. Lock the door to distractions and conquer today's remaining habits.",
  "Winter Arc is not about feeling ready. It is about executing when everything in you wants comfort. Embrace the friction.",
  "When you want to stop, that's where the real training begins. Win this day, one protocol at a time.",
  "Silence the noise. The world is sleeping while you forge your destiny in the shadows of the arc.",
  "Discipline equals freedom. No excuses, no shortcuts, no compromise. Finish what you started.",
];

export async function generateDisciplineAdvice(req: CoachRequest): Promise<CoachResponse> {
  const apiKey = process.env.GEMINI_API_KEY;

  const streak = req.streak ?? 0;
  const todayCompleted = req.todayCompleted ?? 0;
  const todayTotal = req.todayTotal ?? 5;
  const pending = req.pendingHabits || [];
  const daysRemaining = req.daysRemaining ?? 75;
  const userMsg = req.userMessage ? `User note: "${req.userMessage}"` : '';

  if (apiKey && apiKey !== 'MY_GEMINI_API_KEY' && apiKey.trim() !== '') {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `You are the ruthless, stoic, and relentless Winter Arc Discipline Coach.
Your tone is fierce, direct, grounded in Stoicism and high-performance protocol (reminiscent of Marcus Aurelius, David Goggins, and Jocko Willink).
Do NOT be generic. Be punchy, intense, and action-oriented. Max 2-3 sentences.

Current Trainee Status:
- Winter Arc Days Remaining: ${daysRemaining} days until January 1st
- Current Streak: ${streak} days
- Today's Progress: ${todayCompleted}/${todayTotal} habits checked off
- Unfinished Protocols Today: ${pending.length > 0 ? pending.join(', ') : 'All done so far!'}
${userMsg}

Deliver your direct verdict and command for this warrior right now.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      const text = response.text?.trim();
      if (text) {
        return {
          message: text,
          intensity: streak > 7 ? 'warrior' : 'monk',
          timestamp: new Date().toISOString(),
          source: 'gemini',
        };
      }
    } catch (err: any) {
      console.warn('Gemini AI Coach call failed, falling back to local stoic mantra:', err.message);
    }
  }

  // Fallback generation based on status
  let mantra = FALLBACK_DISCIPLINE_MANTRAS[Math.floor(Math.random() * FALLBACK_DISCIPLINE_MANTRAS.length)];
  if (pending.length > 0) {
    mantra = `You have ${pending.length} mission critical protocol${pending.length > 1 ? 's' : ''} left today (${pending.slice(0, 2).join(', ')}). Stop hesitating and execute before the sun goes down.`;
  } else if (todayCompleted >= todayTotal && todayTotal > 0) {
    mantra = `Standard maintained. All ${todayTotal} protocols crushed today. Do not get comfortable—tomorrow demands the exact same savagery. Stay hard.`;
  }

  return {
    message: mantra,
    intensity: streak > 5 ? 'warrior' : 'stoic',
    timestamp: new Date().toISOString(),
    source: 'fallback',
  };
}
