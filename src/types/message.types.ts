export interface Message {
  id: string;
  message_sid: string;
  direction: 'inbound' | 'outbound';
  from_number: string | null;
  to_number: string | null;
  body: string | null;
  status: 'received' | 'processing' | 'processed' | 'failed';
  processed_at: Date | null;
  task_id: string | null;
  user_id: string | null;
  created_at: Date;
}

export interface CreateMessageInput {
  message_sid: string;
  direction: 'inbound' | 'outbound';
  from_number?: string;
  to_number?: string;
  body?: string;
  status?: 'received' | 'processing' | 'processed' | 'failed';
  task_id?: string;
  user_id?: string;
}
