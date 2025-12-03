export enum AppMode {
  LIVE = 'LIVE',
  CHAT = 'CHAT',
  TERMINAL = 'TERMINAL'
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
  sources?: GroundingSource[];
  isThinking?: boolean;
  image?: {
    data: string; // base64
    mimeType: string;
  };
}

export interface GroundingSource {
  title?: string;
  uri?: string;
}

export enum ChatModelType {
  FAST = 'FAST',
  SEARCH = 'SEARCH'
}

export type VoiceName = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';

export type WidgetType = 'weather_card' | 'stock_chart' | 'map_view' | 'note_pad';

export interface LogEntry {
  time: string;
  message: string;
  type: 'info' | 'tool' | 'error' | 'thought';
}