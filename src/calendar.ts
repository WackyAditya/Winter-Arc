/**
 * Google Calendar API Client
 * Operates client-side using in-memory Bearer token.
 */

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
  };
  htmlLink?: string;
}

export async function listTodayEvents(accessToken: string): Promise<CalendarEvent[]> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const timeMin = startOfDay.toISOString();
  const timeMax = endOfDay.toISOString();

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(
    timeMin
  )}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    let message = `Google Calendar API error (${res.status})`;
    try {
      const errJson = await res.json();
      if (errJson?.error?.message) {
        message = errJson.error.message;
      }
    } catch {
      const text = await res.text();
      if (text) message = text;
    }
    throw new Error(message);
  }

  const data = await res.json();
  return data.items || [];
}

export async function createCalendarEvent(
  accessToken: string,
  event: {
    summary: string;
    description?: string;
    startDateTime: string;
    endDateTime: string;
  }
): Promise<CalendarEvent> {
  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: event.summary,
      description: event.description || 'Winter Arc Discipline Protocol',
      start: {
        dateTime: event.startDateTime,
      },
      end: {
        dateTime: event.endDateTime,
      },
      reminders: {
        useDefault: true,
      },
    }),
  });

  if (!res.ok) {
    let message = `Failed to create calendar event (${res.status})`;
    try {
      const errJson = await res.json();
      if (errJson?.error?.message) {
        message = errJson.error.message;
      }
    } catch {
      const text = await res.text();
      if (text) message = text;
    }
    throw new Error(message);
  }

  return await res.json();
}

export async function deleteCalendarEvent(
  accessToken: string,
  eventId: string
): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!res.ok && res.status !== 404) {
    const errorText = await res.text();
    throw new Error(`Failed to delete calendar event (${res.status}): ${errorText}`);
  }
}
