import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import type { GenerateContentResponse } from '@google/genai';
import { Message, ChatSession, User } from './types';
import ChatWindow from './components/ChatWindow';
import Sidebar from './components/Sidebar';
import Login from './components/Login';
import AboutPage from './components/AboutPage';
import ShareModal from './components/ShareModal';
import InstallGuide from './components/InstallGuide';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [view, setView] = useState<'chat' | 'about'>('chat');
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const systemInstruction = `আপনি "সবজান্তা"। সবসময় সুন্দর ও শুদ্ধ বাংলায় উত্তর দেবেন।`;

  useEffect(() => {
    const savedUser = localStorage.getItem('sobjanta_user');
    const savedSessions = localStorage.getItem('sobjanta_sessions');

    if (savedUser) setUser(JSON.parse(savedUser));
    if (savedSessions) setSessions(JSON.parse(savedSessions));
  }, []);

  useEffect(() => {
    localStorage.setItem('sobjanta_sessions', JSON.stringify(sessions));
  }, [sessions]);

  const handleLogin = (name: string) => {
    const newUser = { name, isLoggedIn: true };
    setUser(newUser);
    localStorage.setItem('sobjanta_user', JSON.stringify(newUser));
  };

  const createNewChat = () => {
    const id = Date.now().toString();
    const newSession = {
      id,
      title: 'নতুন আড্ডা',
      messages: [],
      lastUpdated: new Date()
    };
    setSessions([newSession, ...sessions]);
    setCurrentSessionId(id);
  };

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;

    const apiKey = import.meta.env.VITE_API_KEY;

    if (!apiKey) {
      setError("VITE_API_KEY পাওয়া যাচ্ছে না। Vercel এ Environment Variable সেট করুন।");
      return;
    }

    const ai = new GoogleGenAI({ apiKey });

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputText,
      timestamp: new Date()
    };

    let session = sessions.find(s => s.id === currentSessionId);
    if (!session) {
      createNewChat();
      session = sessions[0];
    }

    const updatedMessages = [...(session?.messages || []), userMessage];

    setSessions(prev =>
      prev.map(s =>
        s.id === session!.id
          ? { ...s, messages: updatedMessages }
          : s
      )
    );

    setInputText('');
    setIsTyping(true);

    try {
      const response: GenerateContentResponse =
        await ai.models.generateContent({
          model: 'gemini-1.5-flash',
          contents: inputText,
          config: { systemInstruction }
        });

      const assistantMessage: Message = {
        id: Date.now().toString() + '-ai',
        role: 'assistant',
        content: response.text || "দুঃখিত, উত্তর পাওয়া যায়নি।",
        timestamp: new Date()
      };

      setSessions(prev =>
        prev.map(s =>
          s.id === session!.id
            ? { ...s, messages: [...updatedMessages, assistantMessage] }
            : s
        )
      );

    } catch (err) {
      setError("এআই উত্তর দিতে ব্যর্থ হয়েছে।");
    }

    setIsTyping(false);
  };

  if (!user) return <Login onLogin={handleLogin} />;

  return (
    <div className="flex h-screen bg-white">
      <Sidebar
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelectSession={setCurrentSessionId}
        onNewChat={createNewChat}
        onDeleteSession={(id) =>
          setSessions(prev => prev.filter(s => s.id !== id))
        }
        onLogout={() => {
          setUser(null);
          localStorage.removeItem('sobjanta_user');
        }}
        onOpenAbout={() => setView('about')}
        onOpenShare={() => {}}
        onOpenInstall={() => {}}
        userName={user.name}
        isOpen={true}
        onClose={() => {}}
      />

      <div className="flex-1 flex flex-col p-4">
        {error && <div className="text-red-500 mb-2">{error}</div>}

        {view === 'chat' ? (
          <ChatWindow
            messages={
              sessions.find(s => s.id === currentSessionId)?.messages || []
            }
            onHintClick={handleSendMessage}
          />
        ) : (
          <AboutPage onBackToChat={() => setView('chat')} />
        )}

        <div className="mt-auto flex gap-2">
          <input
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            className="flex-1 border p-2 rounded"
            placeholder="প্রশ্ন লিখুন..."
          />
          <button
            onClick={handleSendMessage}
            className="bg-indigo-600 text-white px-4 rounded"
          >
            পাঠান
          </button>
        </div>
      </div>

      <ShareModal isOpen={false} onClose={() => {}} appUrl={window.location.origin} />
      <InstallGuide isOpen={false} onClose={() => {}} />
    </div>
  );
};

export default App;
