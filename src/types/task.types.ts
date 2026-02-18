export interface Task {
  id: string;
  raw_text: string;
  parsed_title: string | null;
  description: string | null;
  priority: 'urgent' | 'high' | 'medium' | 'low' | null;
  category: string | null;
  status: 'pending' | 'clarification_needed' | 'active' | 'completed' | 'rejected' | 'deferred';
  alignment_score: number | null;
  pushback_reason: string | null;
  due_date: Date | null;
  estimated_hours: number | null;
  account_id: string | null;
  user_id: string | null;
  created_from_message_sid: string | null;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
}

export interface ParsedTask {
  title: string;
  description?: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  category: string;
  due_date?: string | null;
  estimated_hours?: number;
}

export interface ValidationResult {
  alignmentScore: number;
  needsClarification: boolean;
  clarificationPrompt?: string;
  reasoning: string;
  isValid: boolean;
}

export interface CreateTaskInput {
  raw_text: string;
  parsed_title?: string;
  description?: string;
  priority?: 'urgent' | 'high' | 'medium' | 'low';
  category?: string;
  status?: 'pending' | 'clarification_needed' | 'active' | 'completed' | 'rejected' | 'deferred';
  alignment_score?: number;
  pushback_reason?: string;
  due_date?: Date;
  estimated_hours?: number;
  account_id?: string;
  user_id?: string;
  created_from_message_sid?: string;
}
