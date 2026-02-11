export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isAudio?: boolean;
  imageUrl?: string;
  groundingSources?: Array<{ title: string; uri: string }>;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  lastUpdated: Date;
}

export interface User {
  name: string;
  isLoggedIn: boolean;
}

export interface LiveState {
  isConnected: boolean;
  isSpeaking: boolean;
  isListening: boolean;
  currentTranscription: string;
}
