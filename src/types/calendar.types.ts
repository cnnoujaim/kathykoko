/**
 * Calendar event record from database (local cache of Google Calendar events)
 */
export interface CalendarEvent {
  id: string;
  google_event_id: string;
  account_id: string;
  calendar_id: string;
  title: string | null;
  description: string | null;
  start_time: Date;
  end_time: Date;
  location: string | null;
  event_type: 'work' | 'workout' | 'studio' | 'personal' | 'blocked';
  is_auto_blocked: boolean;
  attendees: any | null; // JSONB
  recurring_rule: string | null;
  task_id: string | null;
  created_at: Date;
  updated_at: Date;
  synced_at: Date;
}

/**
 * Input for creating/updating calendar events in local database
 */
export interface CreateCalendarEventInput {
  google_event_id: string;
  account_id: string;
  calendar_id: string;
  title?: string;
  description?: string;
  start_time: Date;
  end_time: Date;
  location?: string;
  event_type?: 'work' | 'workout' | 'studio' | 'personal' | 'blocked';
  is_auto_blocked?: boolean;
  attendees?: any;
  recurring_rule?: string;
  task_id?: string;
}

/**
 * Calendar conflict detection result
 */
export interface CalendarConflict {
  hasConflict: boolean;
  conflicts: CalendarEvent[];
  availableSlots?: { start: Date; end: Date }[];
}

/**
 * Google Calendar API event format
 * (Simplified - full schema has many more optional fields)
 */
export interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  location?: string;
  attendees?: { email: string }[];
  recurrence?: string[];
}
