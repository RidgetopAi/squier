'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  RecurrenceFrequency,
  RecurrenceFrequencyLabels,
  DayOfWeek,
  DayOfWeekShortLabels,
  RecurrencePresets,
  RecurrenceInput,
} from '@/lib/types';

interface RecurrenceEditorProps {
  /** Current RRULE string (or null if not recurring) */
  value: string | null;
  /** Called when recurrence changes */
  onChange: (rrule: string | null) => void;
  /** Start date for the recurrence (used for preview) */
  startDate?: Date;
  /** Whether the editor is disabled */
  disabled?: boolean;
  /** Compact mode - just show toggle and basic options */
  compact?: boolean;
}

interface ParsedRule {
  frequency: RecurrenceFrequency | 'custom' | null;
  interval: number;
  daysOfWeek: DayOfWeek[];
  endType: 'never' | 'until' | 'count';
  until: string;
  count: number;
}

const ALL_DAYS: DayOfWeek[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const WEEKDAYS: DayOfWeek[] = ['MO', 'TU', 'WE', 'TH', 'FR'];

/**
 * Parse an RRULE string into editable components
 */
function parseRRule(rrule: string | null): ParsedRule {
  if (!rrule) {
    return {
      frequency: null,
      interval: 1,
      daysOfWeek: [],
      endType: 'never',
      until: '',
      count: 10,
    };
  }

  // Remove RRULE: prefix if present
  const rule = rrule.replace(/^RRULE:/, '');
  const parts = rule.split(';');
  const params: Record<string, string> = {};

  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key && value) {
      params[key] = value;
    }
  }

  // Determine frequency
  let frequency: RecurrenceFrequency | 'custom' | null = null;
  const freq = params.FREQ;
  const interval = parseInt(params.INTERVAL || '1', 10);

  if (freq === 'DAILY' && interval === 1) {
    frequency = 'daily';
  } else if (freq === 'WEEKLY') {
    if (interval === 1) {
      frequency = 'weekly';
    } else if (interval === 2) {
      frequency = 'biweekly';
    } else {
      frequency = 'custom';
    }
  } else if (freq === 'MONTHLY' && interval === 1) {
    frequency = 'monthly';
  } else if (freq === 'YEARLY' && interval === 1) {
    frequency = 'yearly';
  } else if (freq) {
    frequency = 'custom';
  }

  // Parse days of week
  const daysOfWeek: DayOfWeek[] = [];
  if (params.BYDAY) {
    const days = params.BYDAY.split(',');
    for (const day of days) {
      // Remove any nth week prefix (e.g., "1MO" -> "MO")
      const cleanDay = day.replace(/^-?\d+/, '') as DayOfWeek;
      if (ALL_DAYS.includes(cleanDay)) {
        daysOfWeek.push(cleanDay);
      }
    }
  }

  // Parse end condition
  let endType: 'never' | 'until' | 'count' = 'never';
  let until = '';
  let count = 10;

  if (params.UNTIL) {
    endType = 'until';
    // Parse RRULE date format (YYYYMMDD or YYYYMMDDTHHMMSSZ)
    const untilStr = params.UNTIL;
    if (untilStr.length >= 8) {
      const year = untilStr.slice(0, 4);
      const month = untilStr.slice(4, 6);
      const day = untilStr.slice(6, 8);
      until = `${year}-${month}-${day}`;
    }
  } else if (params.COUNT) {
    endType = 'count';
    count = parseInt(params.COUNT, 10);
  }

  return {
    frequency,
    interval,
    daysOfWeek,
    endType,
    until,
    count,
  };
}

/**
 * Build an RRULE string from components
 */
function buildRRule(input: RecurrenceInput): string {
  const { frequency, interval = 1, daysOfWeek, endType, until, count } = input;

  const parts: string[] = [];

  // Frequency
  switch (frequency) {
    case 'daily':
      parts.push('FREQ=DAILY');
      break;
    case 'weekly':
      parts.push('FREQ=WEEKLY');
      break;
    case 'biweekly':
      parts.push('FREQ=WEEKLY');
      parts.push('INTERVAL=2');
      break;
    case 'monthly':
      parts.push('FREQ=MONTHLY');
      break;
    case 'yearly':
      parts.push('FREQ=YEARLY');
      break;
  }

  // Interval (if not default and not biweekly which already sets it)
  if (interval > 1 && frequency !== 'biweekly') {
    parts.push(`INTERVAL=${interval}`);
  }

  // Days of week (for weekly/biweekly)
  if (daysOfWeek && daysOfWeek.length > 0 && (frequency === 'weekly' || frequency === 'biweekly')) {
    parts.push(`BYDAY=${daysOfWeek.join(',')}`);
  }

  // End condition
  if (endType === 'until' && until) {
    // Convert to RRULE format (YYYYMMDD)
    const dateStr = until.replace(/-/g, '');
    parts.push(`UNTIL=${dateStr}`);
  } else if (endType === 'count' && count && count > 0) {
    parts.push(`COUNT=${count}`);
  }

  return 'RRULE:' + parts.join(';');
}

export function RecurrenceEditor({
  value,
  onChange,
  startDate,
  disabled = false,
  compact = false,
}: RecurrenceEditorProps) {
  const parsed = useMemo(() => parseRRule(value), [value]);

  const [isRecurring, setIsRecurring] = useState(!!value);
  const [frequency, setFrequency] = useState<RecurrenceFrequency | null>(
    parsed.frequency === 'custom' ? 'weekly' : parsed.frequency
  );
  const [daysOfWeek, setDaysOfWeek] = useState<DayOfWeek[]>(parsed.daysOfWeek);
  const [endType, setEndType] = useState<'never' | 'until' | 'count'>(parsed.endType);
  const [until, setUntil] = useState(parsed.until);
  const [count, setCount] = useState(parsed.count);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Update the RRULE when any field changes
  const updateRule = useCallback(() => {
    if (!isRecurring || !frequency) {
      onChange(null);
      return;
    }

    const rrule = buildRRule({
      frequency,
      daysOfWeek: frequency === 'weekly' || frequency === 'biweekly' ? daysOfWeek : undefined,
      endType,
      until: endType === 'until' ? until : undefined,
      count: endType === 'count' ? count : undefined,
    });

    onChange(rrule);
  }, [isRecurring, frequency, daysOfWeek, endType, until, count, onChange]);

  // Handle toggling recurrence
  const handleToggle = useCallback(() => {
    const newIsRecurring = !isRecurring;
    setIsRecurring(newIsRecurring);

    if (newIsRecurring && !frequency) {
      setFrequency('weekly');
    }

    if (!newIsRecurring) {
      onChange(null);
    } else {
      // Trigger update after state changes
      setTimeout(updateRule, 0);
    }
  }, [isRecurring, frequency, onChange, updateRule]);

  // Handle preset selection
  const handlePreset = useCallback((preset: keyof typeof RecurrencePresets) => {
    setIsRecurring(true);

    switch (preset) {
      case 'DAILY':
        setFrequency('daily');
        setDaysOfWeek([]);
        break;
      case 'WEEKLY':
        setFrequency('weekly');
        setDaysOfWeek([]);
        break;
      case 'BIWEEKLY':
        setFrequency('biweekly');
        setDaysOfWeek([]);
        break;
      case 'MONTHLY':
        setFrequency('monthly');
        setDaysOfWeek([]);
        break;
      case 'YEARLY':
        setFrequency('yearly');
        setDaysOfWeek([]);
        break;
      case 'WEEKDAYS':
        setFrequency('weekly');
        setDaysOfWeek(WEEKDAYS);
        break;
      case 'WEEKENDS':
        setFrequency('weekly');
        setDaysOfWeek(['SA', 'SU']);
        break;
    }

    onChange(RecurrencePresets[preset]);
  }, [onChange]);

  // Handle day toggle
  const toggleDay = useCallback((day: DayOfWeek) => {
    setDaysOfWeek(prev => {
      const newDays = prev.includes(day)
        ? prev.filter(d => d !== day)
        : [...prev, day];

      // Trigger update after state change
      setTimeout(updateRule, 0);
      return newDays;
    });
  }, [updateRule]);

  // Trigger update when relevant state changes
  const handleFrequencyChange = (newFreq: RecurrenceFrequency) => {
    setFrequency(newFreq);
    setTimeout(updateRule, 0);
  };

  const handleEndTypeChange = (newEndType: 'never' | 'until' | 'count') => {
    setEndType(newEndType);
    setTimeout(updateRule, 0);
  };

  const handleUntilChange = (newUntil: string) => {
    setUntil(newUntil);
    setTimeout(updateRule, 0);
  };

  const handleCountChange = (newCount: number) => {
    setCount(newCount);
    setTimeout(updateRule, 0);
  };

  // Compact mode - just toggle and presets
  if (compact) {
    return (
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isRecurring}
            onChange={handleToggle}
            disabled={disabled}
            className="w-4 h-4 rounded border-white/20 bg-white/5 text-purple-500 focus:ring-purple-500/50"
          />
          <span className="text-sm text-white/70">Repeat</span>
        </label>

        {isRecurring && (
          <div className="flex flex-wrap gap-1">
            {(['DAILY', 'WEEKLY', 'MONTHLY'] as const).map(preset => (
              <button
                key={preset}
                onClick={() => handlePreset(preset)}
                disabled={disabled}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  value === RecurrencePresets[preset]
                    ? 'bg-purple-500 text-white'
                    : 'bg-white/5 text-white/70 hover:bg-white/10'
                }`}
              >
                {preset.charAt(0) + preset.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Full editor mode
  return (
    <div className="space-y-4 p-4 bg-white/5 rounded-lg border border-white/10">
      {/* Toggle */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={isRecurring}
          onChange={handleToggle}
          disabled={disabled}
          className="w-5 h-5 rounded border-white/20 bg-white/5 text-purple-500 focus:ring-purple-500/50"
        />
        <span className="font-medium text-white">Repeat this event</span>
      </label>

      {isRecurring && (
        <>
          {/* Quick presets */}
          <div className="space-y-2">
            <span className="text-sm text-white/50">Quick select:</span>
            <div className="flex flex-wrap gap-2">
              {(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'YEARLY', 'WEEKDAYS'] as const).map(preset => (
                <button
                  key={preset}
                  onClick={() => handlePreset(preset)}
                  disabled={disabled}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    value === RecurrencePresets[preset]
                      ? 'bg-purple-500 text-white'
                      : 'bg-white/5 text-white/70 hover:bg-white/10 border border-white/10'
                  }`}
                >
                  {preset === 'WEEKDAYS' ? 'Weekdays' : preset.charAt(0) + preset.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Custom frequency */}
          <div className="space-y-2">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1"
            >
              {showAdvanced ? '- Hide' : '+ Show'} custom options
            </button>

            {showAdvanced && (
              <div className="space-y-4 pt-2">
                {/* Frequency dropdown */}
                <div className="flex items-center gap-3">
                  <span className="text-sm text-white/70">Repeat every:</span>
                  <select
                    value={frequency || 'weekly'}
                    onChange={(e) => handleFrequencyChange(e.target.value as RecurrenceFrequency)}
                    disabled={disabled}
                    className="px-3 py-1.5 rounded-md bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-purple-500"
                  >
                    {(Object.keys(RecurrenceFrequencyLabels) as RecurrenceFrequency[]).map(freq => (
                      <option key={freq} value={freq} className="bg-gray-900">
                        {RecurrenceFrequencyLabels[freq]}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Day picker for weekly/biweekly */}
                {(frequency === 'weekly' || frequency === 'biweekly') && (
                  <div className="space-y-2">
                    <span className="text-sm text-white/70">On days:</span>
                    <div className="flex gap-1">
                      {ALL_DAYS.map(day => (
                        <button
                          key={day}
                          onClick={() => toggleDay(day)}
                          disabled={disabled}
                          className={`w-10 h-10 rounded-md text-sm font-medium transition-colors ${
                            daysOfWeek.includes(day)
                              ? 'bg-purple-500 text-white'
                              : 'bg-white/5 text-white/50 hover:bg-white/10 border border-white/10'
                          }`}
                        >
                          {DayOfWeekShortLabels[day].charAt(0)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* End condition */}
                <div className="space-y-2">
                  <span className="text-sm text-white/70">Ends:</span>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="endType"
                        checked={endType === 'never'}
                        onChange={() => handleEndTypeChange('never')}
                        disabled={disabled}
                        className="w-4 h-4 border-white/20 bg-white/5 text-purple-500 focus:ring-purple-500/50"
                      />
                      <span className="text-sm text-white/70">Never</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="endType"
                        checked={endType === 'until'}
                        onChange={() => handleEndTypeChange('until')}
                        disabled={disabled}
                        className="w-4 h-4 border-white/20 bg-white/5 text-purple-500 focus:ring-purple-500/50"
                      />
                      <span className="text-sm text-white/70">On date</span>
                      {endType === 'until' && (
                        <input
                          type="date"
                          value={until}
                          onChange={(e) => handleUntilChange(e.target.value)}
                          disabled={disabled}
                          className="ml-2 px-2 py-1 rounded-md bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-purple-500"
                        />
                      )}
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="endType"
                        checked={endType === 'count'}
                        onChange={() => handleEndTypeChange('count')}
                        disabled={disabled}
                        className="w-4 h-4 border-white/20 bg-white/5 text-purple-500 focus:ring-purple-500/50"
                      />
                      <span className="text-sm text-white/70">After</span>
                      {endType === 'count' && (
                        <>
                          <input
                            type="number"
                            value={count}
                            onChange={(e) => handleCountChange(parseInt(e.target.value) || 1)}
                            min={1}
                            max={999}
                            disabled={disabled}
                            className="w-16 px-2 py-1 rounded-md bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-purple-500"
                          />
                          <span className="text-sm text-white/70">occurrences</span>
                        </>
                      )}
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Current rule preview */}
          {value && (
            <div className="pt-2 border-t border-white/10">
              <span className="text-xs text-white/40 font-mono break-all">{value}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default RecurrenceEditor;
