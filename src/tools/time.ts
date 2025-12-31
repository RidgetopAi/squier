/**
 * Time Tool
 *
 * Provides current date and time to the LLM.
 * Uses system-detected timezone from config.
 */

import { registerTool } from './index.js';
import { config } from '../config/index.js';

// === TYPES ===

interface GetCurrentTimeArgs {
  format?: 'full' | 'date' | 'time';
}

// === HANDLER ===

function getCurrentTime(args: GetCurrentTimeArgs): string {
  const now = new Date();
  const format = args.format ?? 'full';

  const baseOptions: Intl.DateTimeFormatOptions = {
    timeZone: config.timezone,
  };

  let options: Intl.DateTimeFormatOptions;

  switch (format) {
    case 'date':
      options = {
        ...baseOptions,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      };
      break;

    case 'time':
      options = {
        ...baseOptions,
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short',
      };
      break;

    case 'full':
    default:
      options = {
        ...baseOptions,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      };
      break;
  }

  return now.toLocaleString('en-US', options);
}

// === REGISTRATION ===

registerTool<GetCurrentTimeArgs>(
  'get_current_time',
  'Get the current date and time. Use this when the user asks about the current time, date, day of the week, or when you need to calculate relative times like "in 30 minutes" or "tomorrow".',
  {
    type: 'object',
    properties: {
      format: {
        type: 'string',
        enum: ['full', 'date', 'time'],
        description:
          'Output format: "full" for date and time (default), "date" for date only, "time" for time only',
      },
    },
    required: [],
  },
  getCurrentTime
);
