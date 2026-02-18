import { google, calendar_v3 } from 'googleapis';
import { oauthService } from '../oauth/oauth.service';
import { calendarEventRepository } from '../../repositories/calendar-event.repository';
import { CalendarConflict } from '../../types/calendar.types';

/**
 * Calendar service for Google Calendar integration
 * Handles sync, conflict detection, event creation, and auto-blocking
 */
export class CalendarService {
  /**
   * Sync events from Google Calendar to local database
   * Creates local cache for fast conflict detection
   */
  async syncEvents(accountId: string, calendarId: string = 'primary'): Promise<void> {
    try {
      const auth = await oauthService.getAuthenticatedClient(accountId);
      const calendar = google.calendar({ version: 'v3', auth });

      // Sync events from 7 days ago to 90 days in future
      const timeMin = new Date();
      timeMin.setDate(timeMin.getDate() - 7);
      const timeMax = new Date();
      timeMax.setDate(timeMax.getDate() + 90);

      const response = await calendar.events.list({
        calendarId,
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 2500,
      });

      const events = response.data.items || [];
      console.log(`📅 Syncing ${events.length} events for account ${accountId}`);

      const syncedGoogleIds: string[] = [];

      for (const event of events) {
        if (!event.id || !event.start?.dateTime || !event.end?.dateTime) {
          continue; // Skip all-day events and invalid events
        }

        syncedGoogleIds.push(event.id);

        await calendarEventRepository.upsert({
          google_event_id: event.id,
          account_id: accountId,
          calendar_id: calendarId,
          title: event.summary || 'Untitled Event',
          description: event.description || undefined,
          start_time: new Date(event.start.dateTime),
          end_time: new Date(event.end.dateTime),
          location: event.location || undefined,
          event_type: this.inferEventType(event),
          attendees: event.attendees ? JSON.stringify(event.attendees) : undefined,
          recurring_rule: event.recurrence?.[0],
        });
      }

      // Remove local events that were deleted on Google
      const deleted = await calendarEventRepository.deleteStaleEvents(
        accountId,
        timeMin,
        timeMax,
        syncedGoogleIds
      );

      if (deleted > 0) {
        console.log(`🗑️ Removed ${deleted} deleted event(s) for account ${accountId}`);
      }

      console.log(`✓ Synced ${events.length} events for account ${accountId}`);
    } catch (error) {
      console.error(`Error syncing calendar for account ${accountId}:`, error);
      throw error;
    }
  }

  /**
   * Check for calendar conflicts in a time range
   * Uses local DB for fast response
   */
  async checkConflicts(
    accountId: string,
    startTime: Date,
    endTime: Date
  ): Promise<CalendarConflict> {
    const conflicts = await calendarEventRepository.findInRange(
      accountId,
      startTime,
      endTime
    );

    return {
      hasConflict: conflicts.length > 0,
      conflicts,
    };
  }

  /**
   * Create calendar event from task
   * Creates event in Google Calendar and stores locally
   */
  async createEventFromTask(
    accountId: string,
    taskId: string,
    title: string,
    startTime: Date,
    endTime: Date,
    description?: string
  ): Promise<string> {
    try {
      const auth = await oauthService.getAuthenticatedClient(accountId);
      const calendar = google.calendar({ version: 'v3', auth });

      const event: calendar_v3.Schema$Event = {
        summary: title,
        description: description || `Auto-created from Kathy Koko task`,
        start: { dateTime: startTime.toISOString() },
        end: { dateTime: endTime.toISOString() },
        colorId: '9', // Blue for task-based events
      };

      const response = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: event,
      });

      const googleEventId = response.data.id!;

      // Store in local database
      await calendarEventRepository.upsert({
        google_event_id: googleEventId,
        account_id: accountId,
        calendar_id: 'primary',
        title,
        description,
        start_time: startTime,
        end_time: endTime,
        event_type: 'personal',
        task_id: taskId,
      });

      console.log(`✓ Created calendar event ${googleEventId} for task ${taskId}`);
      return googleEventId;
    } catch (error) {
      console.error('Error creating calendar event:', error);
      throw error;
    }
  }

  /**
   * Delete an event from Google Calendar and local DB
   */
  async deleteEvent(accountId: string, googleEventId: string): Promise<void> {
    try {
      const auth = await oauthService.getAuthenticatedClient(accountId);
      const calendar = google.calendar({ version: 'v3', auth });

      await calendar.events.delete({
        calendarId: 'primary',
        eventId: googleEventId,
      });

      await calendarEventRepository.deleteByGoogleEventId(googleEventId);
      console.log(`✓ Deleted calendar event ${googleEventId}`);
    } catch (error) {
      console.error('Error deleting calendar event:', error);
      throw error;
    }
  }

  /**
   * Update an event on Google Calendar and local DB
   */
  async updateEvent(
    accountId: string,
    googleEventId: string,
    updates: { title?: string; startTime?: Date; endTime?: Date; description?: string }
  ): Promise<void> {
    try {
      const auth = await oauthService.getAuthenticatedClient(accountId);
      const calendar = google.calendar({ version: 'v3', auth });

      // Get existing event first
      const existing = await calendar.events.get({
        calendarId: 'primary',
        eventId: googleEventId,
      });

      const patch: calendar_v3.Schema$Event = {};
      if (updates.title) patch.summary = updates.title;
      if (updates.description) patch.description = updates.description;
      if (updates.startTime) patch.start = { dateTime: updates.startTime.toISOString() };
      if (updates.endTime) patch.end = { dateTime: updates.endTime.toISOString() };

      await calendar.events.patch({
        calendarId: 'primary',
        eventId: googleEventId,
        requestBody: patch,
      });

      // Update local DB
      const localEvent = await calendarEventRepository.findByGoogleEventId(googleEventId);
      if (localEvent) {
        await calendarEventRepository.upsert({
          google_event_id: googleEventId,
          account_id: accountId,
          calendar_id: 'primary',
          title: updates.title ?? localEvent.title ?? undefined,
          description: updates.description ?? localEvent.description ?? undefined,
          start_time: updates.startTime || localEvent.start_time,
          end_time: updates.endTime || localEvent.end_time,
          location: localEvent.location ?? undefined,
          event_type: localEvent.event_type,
        });
      }

      console.log(`✓ Updated calendar event ${googleEventId}`);
    } catch (error) {
      console.error('Error updating calendar event:', error);
      throw error;
    }
  }

  /**
   * Search for events by title across all connected accounts
   */
  async findEventsByTitle(search: string, startDate?: Date, endDate?: Date): Promise<any[]> {
    return calendarEventRepository.findByTitleLike(search, startDate, endDate);
  }

  /**
   * Auto-block time for high-priority goals (studio time, workouts)
   * Finds available slots and creates blocked events
   */
  async autoBlockStudioTime(
    accountId: string,
    weekStartDate: Date,
    hoursPerWeek: number = 8
  ): Promise<void> {
    try {
      const auth = await oauthService.getAuthenticatedClient(accountId);
      const calendar = google.calendar({ version: 'v3', auth });

      // Generate studio time slots
      const slots = this.generateStudioTimeSlots(weekStartDate, hoursPerWeek);

      for (const slot of slots) {
        // Check if already blocked
        const conflict = await this.checkConflicts(accountId, slot.start, slot.end);
        if (conflict.hasConflict) {
          console.log(`⚠️  Skipping ${slot.start} - conflict exists`);
          continue;
        }

        const event: calendar_v3.Schema$Event = {
          summary: '🎵 Studio Time (Auto-blocked)',
          description: 'Auto-blocked for Persephone album work',
          start: { dateTime: slot.start.toISOString() },
          end: { dateTime: slot.end.toISOString() },
          colorId: '11', // Red for blocked time
        };

        const response = await calendar.events.insert({
          calendarId: 'primary',
          requestBody: event,
        });

        await calendarEventRepository.upsert({
          google_event_id: response.data.id!,
          account_id: accountId,
          calendar_id: 'primary',
          title: event.summary!,
          description: event.description!,
          start_time: slot.start,
          end_time: slot.end,
          event_type: 'studio',
          is_auto_blocked: true,
        });

        console.log(`✓ Auto-blocked studio time: ${slot.start}`);
      }
    } catch (error) {
      console.error('Error auto-blocking studio time:', error);
      throw error;
    }
  }

  /**
   * Infer event type from Google Calendar event
   * Used for categorizing synced events
   */
  private inferEventType(
    event: calendar_v3.Schema$Event
  ): 'work' | 'workout' | 'studio' | 'personal' | 'blocked' {
    const summary = (event.summary || '').toLowerCase();

    if (summary.includes('workout') || summary.includes('gym') || summary.includes('run')) {
      return 'workout';
    }
    if (summary.includes('studio') || summary.includes('music') || summary.includes('persephone')) {
      return 'studio';
    }
    if (summary.includes('work') || summary.includes('meeting') || summary.includes('lyra')) {
      return 'work';
    }
    if (summary.includes('blocked') || summary.includes('focus')) {
      return 'blocked';
    }

    return 'personal';
  }

  /**
   * Generate studio time slots for the week
   * Example: Mon/Wed/Fri 6-8pm (2 hrs each) + Sat 10am-2pm (4 hrs) = 10 hrs total
   */
  private generateStudioTimeSlots(weekStart: Date, totalHours: number): { start: Date; end: Date }[] {
    const slots: { start: Date; end: Date }[] = [];

    // Mon/Wed/Fri 6-8pm (2 hrs each)
    const days = [1, 3, 5]; // Mon, Wed, Fri
    for (const dayOffset of days) {
      const start = new Date(weekStart);
      start.setDate(start.getDate() + dayOffset);
      start.setHours(18, 0, 0, 0); // 6pm

      const end = new Date(start);
      end.setHours(20, 0, 0, 0); // 8pm

      slots.push({ start, end });
    }

    // Saturday 10am-2pm (4 hrs)
    const satStart = new Date(weekStart);
    satStart.setDate(satStart.getDate() + 6);
    satStart.setHours(10, 0, 0, 0);

    const satEnd = new Date(satStart);
    satEnd.setHours(14, 0, 0, 0);

    slots.push({ start: satStart, end: satEnd });

    return slots;
  }
}

export const calendarService = new CalendarService();
