/**
 * Calendar Tools
 *
 * LLM tools for reading and creating user calendar events in Google Calendar.
 * Queries the google_events table (synced from Google) for actual calendar events.
 * Can create new events directly in Google Calendar.
 */

import { getAllEvents, pushEventToGoogle, type GoogleEvent } from '../services/google/events.js';
import { getDefaultPushCalendar } from '../services/google/calendars.js';
import { listSyncEnabledAccounts } from '../services/google/auth.js';
import { config } from '../config/index.js';
import type { ToolHandler } from './types.js';

/**
 * Format event time for LLM consumption.
 * All-day events return just the date (YYYY-MM-DD) to avoid timezone confusion.
 * Timed events return the full ISO timestamp.
 */
function formatEventTime(time: Date | null, allDay: boolean): string | null {
  if (!time) return null;
  if (allDay) {
    // For all-day events, extract just the date portion
    // The time is stored as midnight UTC, so we use UTC methods to get the correct date
    const iso = time.toISOString();
    return iso.substring(0, 10); // YYYY-MM-DD
  }
  return time.toISOString();
}

// =============================================================================
// GET UPCOMING EVENTS TOOL
// =============================================================================

interface GetUpcomingEventsArgs {
  days?: number;
  limit?: number;
  include_completed?: boolean;
}

async function handleGetUpcomingEvents(args: GetUpcomingEventsArgs | null): Promise<string> {
  const { days = 7, limit = 50 } = args ?? {};

  try {
    // Calculate date range
    const now = new Date();
    const endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    // Query actual Google Calendar events
    const events = await getAllEvents({
      timeMin: now,
      timeMax: endDate,
    });

    // Apply limit
    const limitedEvents = events.slice(0, limit);

    if (limitedEvents.length === 0) {
      return JSON.stringify({
        message: `No calendar events in the next ${days} day(s)`,
        date_range: {
          from: now.toISOString(),
          to: endDate.toISOString(),
        },
        events: [],
      });
    }

    // Format for LLM consumption
    const formatEvent = (e: GoogleEvent & { calendar_name?: string }) => ({
      id: e.id,
      title: e.summary,
      description: e.description,
      start_time: formatEventTime(e.start_time, e.all_day),
      end_time: formatEventTime(e.end_time, e.all_day),
      all_day: e.all_day,
      location: e.location,
      status: e.status,
      is_recurring: !!e.rrule || !!e.recurring_event_id,
      calendar: e.calendar_name,
    });

    return JSON.stringify({
      date_range: {
        from: now.toISOString(),
        to: endDate.toISOString(),
      },
      count: limitedEvents.length,
      events: limitedEvents.map(formatEvent),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to get upcoming events: ${message}`, events: [] });
  }
}

export const getUpcomingEventsToolName = 'get_upcoming_events';

export const getUpcomingEventsToolDescription =
  'Get the user\'s upcoming scheduled items (commitments, tasks with due dates, and calendar events if synced). Use when user asks "what\'s coming up?", "what do I have planned?", or "what\'s on my schedule?" Returns scheduled items for the next N days.';

export const getUpcomingEventsToolParameters = {
  type: 'object',
  properties: {
    days: {
      type: 'number',
      description: 'Number of days ahead to look (default: 7, max: 30)',
    },
    limit: {
      type: 'number',
      description: 'Maximum number of events to return (default: 50)',
    },
    include_completed: {
      type: 'boolean',
      description: 'Include completed events (default: false)',
    },
  },
  required: [],
};

export const getUpcomingEventsToolHandler: ToolHandler<GetUpcomingEventsArgs> = handleGetUpcomingEvents;

// =============================================================================
// GET TODAY'S EVENTS TOOL
// =============================================================================

interface GetTodaysEventsArgs {
  include_overdue?: boolean;
}

async function handleGetTodaysEvents(args: GetTodaysEventsArgs | null): Promise<string> {
  // include_overdue not applicable for calendar events
  void args;

  try {
    // Today's range
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    // Get today's Google Calendar events
    const events = await getAllEvents({
      timeMin: startOfDay,
      timeMax: endOfDay,
    });

    if (events.length === 0) {
      return JSON.stringify({
        message: 'No calendar events for today',
        today: now.toISOString().split('T')[0],
        events: [],
      });
    }

    // Format for LLM consumption
    const formatEvent = (e: GoogleEvent & { calendar_name?: string }) => {
      const startTime = e.start_time ? new Date(e.start_time) : null;
      const isPast = startTime && !e.all_day && startTime < now;

      return {
        id: e.id,
        title: e.summary,
        description: e.description,
        start_time: formatEventTime(e.start_time, e.all_day),
        end_time: formatEventTime(e.end_time, e.all_day),
        all_day: e.all_day,
        location: e.location,
        status: e.status,
        is_past: isPast,
        calendar: e.calendar_name,
      };
    };

    const formattedEvents = events.map(formatEvent);
    const upcomingCount = formattedEvents.filter((e) => !e.is_past).length;

    return JSON.stringify({
      today: now.toISOString().split('T')[0],
      count: formattedEvents.length,
      upcoming_count: upcomingCount,
      events: formattedEvents,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to get today's events: ${message}`, events: [] });
  }
}

export const getTodaysEventsToolName = 'get_todays_events';

export const getTodaysEventsToolDescription =
  'Get the user\'s scheduled items for TODAY plus any overdue items. Use when user asks "what do I have today?", "what\'s on my schedule today?", or "anything due today?"';

export const getTodaysEventsToolParameters = {
  type: 'object',
  properties: {
    include_overdue: {
      type: 'boolean',
      description: 'Include overdue events from previous days (default: true)',
    },
  },
  required: [],
};

export const getTodaysEventsToolHandler: ToolHandler<GetTodaysEventsArgs> = handleGetTodaysEvents;

// =============================================================================
// GET EVENTS DUE SOON TOOL
// =============================================================================

interface GetEventsDueSoonArgs {
  within_hours?: number;
}

async function handleGetEventsDueSoon(args: GetEventsDueSoonArgs | null): Promise<string> {
  const { within_hours = 24 } = args ?? {};

  try {
    const now = new Date();
    const endTime = new Date(now.getTime() + within_hours * 60 * 60 * 1000);

    // Get Google Calendar events within the time window
    const events = await getAllEvents({
      timeMin: now,
      timeMax: endTime,
    });

    if (events.length === 0) {
      return JSON.stringify({
        message: `No calendar events within the next ${within_hours} hour(s)`,
        within_hours,
        events: [],
      });
    }

    // Format for LLM consumption
    const formattedEvents = events.map((e: GoogleEvent & { calendar_name?: string }) => {
      const startTime = e.start_time ? new Date(e.start_time) : null;
      // For all-day events, don't calculate minutes (not meaningful)
      const minutesUntilStart = startTime && !e.all_day
        ? Math.round((startTime.getTime() - now.getTime()) / (1000 * 60))
        : null;

      return {
        id: e.id,
        title: e.summary,
        description: e.description,
        start_time: formatEventTime(e.start_time, e.all_day),
        end_time: formatEventTime(e.end_time, e.all_day),
        all_day: e.all_day,
        location: e.location,
        minutes_until_start: minutesUntilStart,
        status: e.status,
        calendar: e.calendar_name,
      };
    });

    return JSON.stringify({
      count: formattedEvents.length,
      within_hours,
      events: formattedEvents,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to get events due soon: ${message}`, events: [] });
  }
}

export const getEventsDueSoonToolName = 'get_events_due_soon';

export const getEventsDueSoonToolDescription =
  'Get events that are due soon (within a specified number of hours). Use this when the user asks "what\'s coming up soon?", "do I have anything urgent?", or needs to know about imminent deadlines.';

export const getEventsDueSoonToolParameters = {
  type: 'object',
  properties: {
    within_hours: {
      type: 'number',
      description: 'Hours ahead to look for due events (default: 24)',
    },
  },
  required: [],
};

export const getEventsDueSoonToolHandler: ToolHandler<GetEventsDueSoonArgs> = handleGetEventsDueSoon;

// =============================================================================
// CREATE CALENDAR EVENT TOOL
// =============================================================================

interface CreateCalendarEventArgs {
  title: string;
  start_time: string;
  duration_minutes?: number;
  all_day?: boolean;
  description?: string;
  location?: string;
}

/**
 * Parse a date/time string flexibly
 * Supports ISO 8601, or date strings like "2026-01-09" with optional time
 */
function parseDateTime(input: string, allDay: boolean): Date {
  // If all-day, just parse the date portion
  if (allDay) {
    // Handle YYYY-MM-DD format
    const dateMatch = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (dateMatch) {
      const [, year, month, day] = dateMatch;
      return new Date(parseInt(year!, 10), parseInt(month!, 10) - 1, parseInt(day!, 10));
    }
  }

  // Try parsing as ISO 8601 first
  const date = new Date(input);
  if (!isNaN(date.getTime())) {
    return date;
  }

  throw new Error(`Unable to parse date/time: ${input}`);
}

async function handleCreateCalendarEvent(args: CreateCalendarEventArgs): Promise<string> {
  const {
    title,
    start_time,
    duration_minutes = 60,
    all_day = false,
    description,
    location
  } = args;

  if (!title || title.trim().length === 0) {
    return JSON.stringify({ error: 'Title is required', event: null });
  }

  if (!start_time) {
    return JSON.stringify({ error: 'Start time is required', event: null });
  }

  try {
    // Get the first sync-enabled Google account
    const accounts = await listSyncEnabledAccounts();
    if (accounts.length === 0) {
      return JSON.stringify({
        error: 'No Google account connected. Please connect a Google account first.',
        event: null
      });
    }
    const account = accounts[0]!;

    // Get the default calendar for pushing events
    const calendar = await getDefaultPushCalendar(account.id);
    if (!calendar) {
      return JSON.stringify({
        error: 'No calendar available for creating events. Please configure a default calendar.',
        event: null
      });
    }

    // Check if calendar supports writes
    if (calendar.sync_direction === 'read_only') {
      return JSON.stringify({
        error: `Calendar "${calendar.summary}" is read-only. Please configure a writable calendar.`,
        event: null
      });
    }

    // Parse the start time
    let startDate: Date;
    try {
      startDate = parseDateTime(start_time, all_day);
    } catch (parseError) {
      return JSON.stringify({
        error: `Invalid start_time format: ${start_time}. Use ISO 8601 format (e.g., "2026-01-09T08:00:00" or "2026-01-09" for all-day).`,
        event: null
      });
    }

    // Create the event in Google Calendar
    const result = await pushEventToGoogle(calendar, {
      id: crypto.randomUUID(), // Generate a commitment ID for tracking
      title: title.trim(),
      description: description?.trim(),
      due_at: startDate,
      duration_minutes: all_day ? 24 * 60 : duration_minutes, // All-day = 24 hours
      all_day,
      timezone: config.timezone,
    });

    // Calculate end time for response
    const endDate = new Date(startDate.getTime() + (all_day ? 24 * 60 : duration_minutes) * 60 * 1000);

    return JSON.stringify({
      message: `Event "${title}" created successfully in "${calendar.summary}"`,
      event: {
        id: result.event_id,
        title: title.trim(),
        description: description?.trim() || null,
        location: location || null,
        start_time: all_day ? startDate.toISOString().split('T')[0] : startDate.toISOString(),
        end_time: all_day ? endDate.toISOString().split('T')[0] : endDate.toISOString(),
        all_day,
        calendar: calendar.summary,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[CreateCalendarEvent] Error:', error);
    return JSON.stringify({ error: `Failed to create calendar event: ${message}`, event: null });
  }
}

export const createCalendarEventToolName = 'create_calendar_event';

export const createCalendarEventToolDescription =
  'Create a new event in the user\'s Google Calendar. Use this when the user asks to add something to their calendar, schedule an event, or block time. Examples: "add a meeting to my calendar", "schedule dentist appointment", "block Friday 8am-5pm for Pad-A-Thon".';

export const createCalendarEventToolParameters = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      description: 'The title/name of the event (e.g., "Team Meeting", "Dentist Appointment")',
    },
    start_time: {
      type: 'string',
      description: 'The start date/time in ISO 8601 format. For timed events use full datetime (e.g., "2026-01-09T08:00:00"). For all-day events use date only (e.g., "2026-01-09").',
    },
    duration_minutes: {
      type: 'number',
      description: 'Duration in minutes (default: 60). For multi-hour events, calculate minutes (e.g., 8am-5pm = 540 minutes).',
    },
    all_day: {
      type: 'boolean',
      description: 'Whether this is an all-day event (default: false). If true, only the date portion of start_time is used.',
    },
    description: {
      type: 'string',
      description: 'Optional description or notes for the event.',
    },
    location: {
      type: 'string',
      description: 'Optional location for the event.',
    },
  },
  required: ['title', 'start_time'],
};

export const createCalendarEventToolHandler: ToolHandler<CreateCalendarEventArgs> = handleCreateCalendarEvent;
