export type ModuleType = 'chat' | 'image' | 'video';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  images?: string[];
}

export interface ChatMessage extends Message {
  id: string;
  timestamp: number;
}

export interface ImageResult {
  url: string | null;
  b64_json: string | null;
  revised_prompt: string | null;
}

export interface ImageGeneration {
  prompt: string;
  size: string;
  style?: string;
  results: ImageResult[];
  timestamp: number;
}

export interface VideoTask {
  task_id: string;
  video_id: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  prompt: string;
  size: string;
  seconds: string;
  created_at: number;
  completed_at?: number;
  video_url?: string;
  error?: string;
}
