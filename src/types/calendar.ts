export type CalendarView = 'month' | 'week' | 'day';

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  type: 'meeting' | ' Showing' | 'task' | 'deadline' | 'other';
  start: Date;
  end: Date;
  allDay?: boolean;
  propertyId?: string;
  clientId?: string;
  taskId?: string;
  attendees?: string[];
  location?: string;
  reminder?: number; // minutes before
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}