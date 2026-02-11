
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import type { LiveServerMessage, GenerateContentResponse } from '@google/genai';
import { Message, LiveState, ChatSession, User } from './types.ts';
import Header from './components/Header.tsx';
import ChatWindow from './components/ChatWindow.tsx';
import Sidebar from './components/Sidebar.tsx';
import Login from './components/Login.tsx';
import AboutPage from './components/AboutPage.tsx';
import ShareModal from './components/ShareModal.tsx';
import InstallGuide from './components/InstallGuide.tsx';
import VoiceWave from './components/VoiceWave.tsx';
import { 
  decode, 
  decodeAudioData, 
  createPcmBlob 
} from './utils/audioUtils.ts';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [view, setView] = useState<'chat' | 'about'>('chat');
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isInstallGuideOpen, setIsInstallGuideOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveState, setLiveState] = useState<LiveState>({
    isConnected: false,
    isSpeaking: false,
    isListening: false,
    currentTranscription: '',
  });

  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const systemInstruction = `আপনি সবজান্তা (Sobjanta), জুবায়ের তালুকদার (Jubayer Talukder) দ্বারা তৈরি একজন স্মার্ট এআই বন্ধু। আপনার বাড়ি সিরাজগঞ্জের কামারখন্দে। আপনি সবসময় বাংলায় উত্তর দেবেন।`;

  useEffect(() => {
    const savedUser = localStorage.getItem('sobjanta_user');
    const savedSessions = localStorage.getItem('sobjanta_sessions');
    if (savedUser) setUser(JSON.parse(savedUser));
    if (savedSessions) {
      const parsed = JSON.parse(savedSessions);
      const formatted = parsed.map((s: any) => ({
        ...s,
        lastUpdated: new Date(s.lastUpdated),
        messages: s.messages.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }))
      }));
      setSessions(formatted);
      if (formatted.length > 0) setCurrentSessionId(formatted[0].id);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('sobjanta_sessions', JSON.stringify(sessions));
  }, [sessions]);

  const handleLogin = (name: string) => {
    const newUser = { name, isLoggedIn: true };
    setUser(newUser);
    localStorage.setItem('sobjanta_user', JSON.stringify(newUser));
  };

  const handleLogout = () => {
    if (confirm('লগআউট করতে চান?')) {
      setUser(null);
      localStorage.removeItem('sobjanta_user');
      stopLiveConversation();
    }
  };

  const createNewChat = () => {
    setView('chat');
    const newId = Date.now().toString();
    const newSession: ChatSession = {
      id: newId,
      title: 'নতুন চ্যাট',
      messages: [],
      lastUpdated: new Date(),
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newId);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const handleDeleteSession = (sessionId: string) => {
    if (confirm('এই চ্যাটটি কি মুছে ফেলতে চান?')) {
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (currentSessionId === sessionId) setCurrentSessionId(null);
    }
  };

  const currentMessages = sessions.find(s => s.id === currentSessionId)?.messages || [];

  const updateSession = (sessionId: string, newMessages: Message[]) => {
    setSessions(prev => prev.map(s => {
      if (s.id === sessionId) {
        let newTitle = s.title;
        if ((s.title === 'নতুন চ্যাট' || s.title === 'শিরোনামহীন') && newMessages.length > 0) {
          const firstUserMsg = newMessages.find(m => m.role === 'user');
          if (firstUserMsg) newTitle = firstUserMsg.content.slice(0, 30) + '...';
        }
        return { ...s, messages: newMessages, lastUpdated: new Date(), title: newTitle };
      }
      return s;
    }));
  };

  const handleSendMessage = async (text?: string) => {
    const content = text || inputText;
    if (!content.trim()) return;
    let sessionId = currentSessionId;
    if (!sessionId) {
      sessionId = Date.now().toString();
      const newSession = { id: sessionId, title: content.slice(0, 30), messages: [], lastUpdated: new Date() };
      setSessions(prev => [newSession, ...prev]);
      setCurrentSessionId(sessionId);
    }
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content, timestamp: new Date() };
    const updatedMsgs = [...currentMessages, userMsg];
    updateSession(sessionId, updatedMsgs);
    setInputText('');
    setIsTyping(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: content,
        config: { systemInstruction: systemInstruction, tools: [{ googleSearch: {} }] }
      });
      const assistantMsg: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: response.text || '',
        timestamp: new Date(),
        groundingSources: response.candidates?.[0]?.groundingMetadata?.groundingChunks?.filter((ch:any) => ch.web).map((ch:any) => ({ title: ch.web.title, uri: ch.web.uri })) || []
      };
      updateSession(sessionId, [...updatedMsgs, assistantMsg]);
    } catch (e) {
      setError("নেটওয়ার্ক সমস্যা।");
    } finally {
      setIsTyping(false);
    }
  };

  const startLiveConversation = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setLiveState(prev => ({ ...prev, isConnected: true, isListening: true }));
            const source = audioContextRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              sessionPromise.then(s => s.sendRealtimeInput({ media: createPcmBlob(e.inputBuffer.getChannelData(0)) }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(audioContextRef.current!.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              setLiveState(prev => ({ ...prev, isSpeaking: true }));
              const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContextRef.current!, 24000, 1);
              const source = outputAudioContextRef.current!.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputAudioContextRef.current!.destination);
              source.start(Math.max(nextStartTimeRef.current, outputAudioContextRef.current!.currentTime));
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContextRef.current!.currentTime) + audioBuffer.duration;
            }
          },
          onclose: () => setLiveState(prev => ({ ...prev, isConnected: false }))
        },
        config: { responseModalities: [Modality.AUDIO], systemInstruction: systemInstruction }
      });
    } catch (e) { setError("মাইক সমস্যা।"); }
  };

  const stopLiveConversation = () => {
    if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach(t => t.stop());
    setLiveState({ isConnected: false, isSpeaking: false, isListening: false, currentTranscription: '' });
  };

  if (!user) return <Login onLogin={handleLogin} />;

  return (
    <div className="flex h-screen bg-white overflow-hidden bn-font">
      <Sidebar 
        sessions={sessions} 
        currentSessionId={currentSessionId} 
        onSelectSession={(id) => { setCurrentSessionId(id); setView('chat'); if (window.innerWidth < 768) setIsSidebarOpen(false); }} 
        onNewChat={createNewChat} 
        onDeleteSession={handleDeleteSession}
        onLogout={handleLogout}
        onOpenAbout={() => { setView('about'); setIsSidebarOpen(false); }}
        onOpenShare={() => setIsShareModalOpen(true)}
        onOpenInstall={() => setIsInstallGuideOpen(true)}
        userName={user.name}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0 relative">
        <Header onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />
        <main className="flex-1 flex flex-col pt-16 pb-24 overflow-hidden relative">
          {error && <div className="p-4 bg-red-50 text-red-600 font-bold">{error}</div>}
          {view === 'chat' ? (
            <>
              <ChatWindow messages={currentMessages} onHintClick={handleSendMessage} />
              {liveState.isConnected && (
                <div className="absolute inset-0 bg-white/95 z-50 flex flex-col items-center justify-center p-6 text-center">
                  <div className="w-32 h-32 bg-indigo-600 rounded-full flex items-center justify-center shadow-2xl mb-8 animate-pulse">
                    <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                  </div>
                  <h3 className="text-3xl font-black mb-10">সবজান্তা শুনছে...</h3>
                  <button onClick={stopLiveConversation} className="px-10 py-4 bg-red-500 text-white font-black rounded-2xl shadow-xl">বন্ধ করুন</button>
                </div>
              )}
              {isTyping && <div className="p-4 text-xs font-bold text-indigo-500 animate-pulse">সবজান্তা ভাবছে...</div>}
            </>
          ) : <AboutPage onBackToChat={() => setView('chat')} />}
        </main>
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 flex gap-3">
          <button onClick={liveState.isConnected ? stopLiveConversation : startLiveConversation} className={`w-12 h-12 rounded-2xl flex items-center justify-center ${liveState.isConnected ? 'bg-red-500' : 'bg-indigo-600'} text-white shadow-lg`}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
          </button>
          <input type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()} placeholder="কিছু জিজ্ঞাসা করুন..." className="flex-1 h-12 px-5 rounded-2xl border bg-slate-50 focus:bg-white outline-none" />
          <button onClick={() => handleSendMessage()} className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center"><svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg></button>
        </div>
      </div>
      <ShareModal isOpen={isShareModalOpen} onClose={() => setIsShareModalOpen(false)} appUrl={window.location.origin} />
      <InstallGuide isOpen={isInstallGuideOpen} onClose={() => setIsInstallGuideOpen(false)} />
    </div>
  );
};

export default App;
