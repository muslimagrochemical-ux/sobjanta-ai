
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import type { LiveServerMessage } from '@google/genai';
import { Message, LiveState, ChatSession, User } from './types.ts';
import Header from './components/Header.tsx';
import ChatWindow from './components/ChatWindow.tsx';
import Sidebar from './components/Sidebar.tsx';
import Login from './components/Login.tsx';
import AboutPage from './components/AboutPage.tsx';
import ShareModal from './components/ShareModal.tsx';
import InstallGuide from './components/InstallGuide.tsx';
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
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const systemInstruction = `আপনি সবজান্তা (Sobjanta), জুবায়ের তালুকদার (Jubayer Talukder) দ্বারা তৈরি একজন অত্যন্ত বুদ্ধিমান এবং বন্ধুসুলভ এআই। আপনার বাড়ি সিরাজগঞ্জের কামারখন্দে। আপনি সবসময় শুদ্ধ বাংলায় উত্তর দেবেন। ব্যবহারকারীর সাথে এমনভাবে কথা বলবেন যেন আপনি তার বহুদিনের পুরনো বন্ধু। কোনো বিষয়ে নিশ্চিত না হলে আপনি গুগল সার্চের সাহায্য নেবেন।`;

  useEffect(() => {
    const savedUser = localStorage.getItem('sobjanta_user');
    const savedSessions = localStorage.getItem('sobjanta_sessions');
    if (savedUser) setUser(JSON.parse(savedUser));
    if (savedSessions) {
      try {
        const parsed = JSON.parse(savedSessions);
        const formatted = parsed.map((s: any) => ({
          ...s,
          lastUpdated: new Date(s.lastUpdated),
          messages: s.messages.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }))
        }));
        setSessions(formatted);
        if (formatted.length > 0) setCurrentSessionId(formatted[0].id);
      } catch (e) {
        console.error("Session restoration failed", e);
      }
    }
  }, []);

  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem('sobjanta_sessions', JSON.stringify(sessions));
    }
  }, [sessions]);

  const handleLogin = (name: string) => {
    const newUser = { name, isLoggedIn: true };
    setUser(newUser);
    localStorage.setItem('sobjanta_user', JSON.stringify(newUser));
    createNewChat();
  };

  const handleLogout = () => {
    if (confirm('আপনি কি নিশ্চিত যে লগআউট করতে চান?')) {
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
    if (confirm('এই আড্ডাটি কি মুছে ফেলতে চান?')) {
      const updated = sessions.filter(s => s.id !== sessionId);
      setSessions(updated);
      if (currentSessionId === sessionId) {
        setCurrentSessionId(updated.length > 0 ? updated[0].id : null);
      }
    }
  };

  const currentMessages = sessions.find(s => s.id === currentSessionId)?.messages || [];

  const updateSession = (sessionId: string, newMessages: Message[]) => {
    setSessions(prev => prev.map(s => {
      if (s.id === sessionId) {
        let title = s.title;
        if ((title === 'নতুন চ্যাট') && newMessages.length > 0) {
          const firstUser = newMessages.find(m => m.role === 'user');
          if (firstUser) title = firstUser.content.slice(0, 25) + (firstUser.content.length > 25 ? '...' : '');
        }
        return { ...s, messages: newMessages, lastUpdated: new Date(), title };
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
      const newSession = { id: sessionId, title: content.slice(0, 25), messages: [], lastUpdated: new Date() };
      setSessions(prev => [newSession, ...prev]);
      setCurrentSessionId(sessionId);
    }

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content, timestamp: new Date() };
    const currentSession = sessions.find(s => s.id === sessionId);
    const updatedMsgs = [...(currentSession?.messages || []), userMsg];
    
    updateSession(sessionId!, updatedMsgs);
    setInputText('');
    setIsTyping(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: content,
        config: { 
          systemInstruction: systemInstruction,
          tools: [{ googleSearch: {} }] 
        }
      });

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.text || 'দুঃখিত বন্ধু, আমি বিষয়টি বুঝতে পারছি না।',
        timestamp: new Date(),
        groundingSources: response.candidates?.[0]?.groundingMetadata?.groundingChunks
          ?.filter((ch: any) => ch.web)
          ?.map((ch: any) => ({ title: ch.web.title, uri: ch.web.uri })) || []
      };
      
      updateSession(sessionId!, [...updatedMsgs, assistantMsg]);
    } catch (e) {
      setError("নেটওয়ার্কের সমস্যা! আবার চেষ্টা করুন বন্ধু।");
    } finally {
      setIsTyping(false);
    }
  };

  const startLiveConversation = async () => {
    setError(null);
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
            setLiveState(prev => ({ ...prev, isConnected: true }));
            const source = audioContextRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              const pcmBlob = createPcmBlob(e.inputBuffer.getChannelData(0));
              sessionPromise.then(s => s.sendRealtimeInput({ media: pcmBlob }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(audioContextRef.current!.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
            const audioData = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData) {
              setLiveState(prev => ({ ...prev, isSpeaking: true }));
              const buffer = await decodeAudioData(decode(audioData), outputAudioContextRef.current!, 24000, 1);
              const source = outputAudioContextRef.current!.createBufferSource();
              source.buffer = buffer;
              source.connect(outputAudioContextRef.current!.destination);
              
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContextRef.current!.currentTime);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              
              sourcesRef.current.add(source);
              source.onended = () => {
                sourcesRef.current.delete(source);
                if (sourcesRef.current.size === 0) setLiveState(prev => ({ ...prev, isSpeaking: false }));
              };
            }
            if (msg.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => s.stop());
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onerror: () => {
            setError("ভয়েস চ্যাট বন্ধ হয়ে গেছে।");
            stopLiveConversation();
          },
          onclose: () => setLiveState(prev => ({ ...prev, isConnected: false }))
        },
        config: { 
          responseModalities: [Modality.AUDIO], 
          systemInstruction: systemInstruction,
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
        }
      });
    } catch (e) { 
      setError("মাইক্রোফোন চালু করা যাচ্ছে না। ব্রাউজার পারমিশন চেক করুন।"); 
    }
  };

  const stopLiveConversation = () => {
    mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    setLiveState({ isConnected: false, isSpeaking: false, isListening: false, currentTranscription: '' });
    sourcesRef.current.forEach(s => s.stop());
    sourcesRef.current.clear();
  };

  if (!user) return <Login onLogin={handleLogin} />;

  return (
    <div className="flex h-screen bg-white bn-font overflow-hidden">
      <Sidebar 
        sessions={sessions} 
        currentSessionId={currentSessionId} 
        onSelectSession={(id) => { setCurrentSessionId(id); setView('chat'); setIsSidebarOpen(false); }} 
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
      
      <div className="flex-1 flex flex-col relative bg-slate-50/20">
        <Header onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />
        
        <main className="flex-1 flex flex-col pt-16 pb-24 overflow-hidden">
          {error && (
            <div className="m-4 p-3 bg-red-50 text-red-600 rounded-xl text-xs font-bold flex justify-between items-center animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span>{error}</span>
              </div>
              <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded-lg">✕</button>
            </div>
          )}
          
          {view === 'chat' ? (
            <>
              <ChatWindow messages={currentMessages} onHintClick={handleSendMessage} />
              
              {liveState.isConnected && (
                <div className="absolute inset-0 bg-white/95 z-50 flex flex-col items-center justify-center animate-in fade-in">
                  <div className="w-32 h-32 bg-indigo-600 rounded-full flex items-center justify-center shadow-2xl animate-pulse mb-8 ring-8 ring-indigo-50">
                    <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                  </div>
                  <h3 className="text-2xl font-black mb-4">সবজান্তা শুনছে...</h3>
                  <p className="text-slate-400 bn-font mb-10">আপনার সিরাজগঞ্জের এআই বন্ধু আপনার কথা শোনার জন্য তৈরি</p>
                  <button onClick={stopLiveConversation} className="px-12 py-4 bg-red-500 hover:bg-red-600 text-white font-black rounded-2xl shadow-xl transition-all active:scale-95">কথা বলা বন্ধ করুন</button>
                </div>
              )}
              
              {isTyping && (
                <div className="px-6 py-2 flex items-center gap-2">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></div>
                    <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce delay-75"></div>
                    <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce delay-150"></div>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">সবজান্তা ভাবছে...</span>
                </div>
              )}
            </>
          ) : (
            <AboutPage onBackToChat={() => setView('chat')} />
          )}
        </main>

        {view === 'chat' && (
          <div className="fixed bottom-0 left-0 right-0 md:left-auto md:w-[calc(100%-320px)] bg-white/80 backdrop-blur-xl border-t border-slate-100 p-4 flex gap-3 z-30">
            <button onClick={startLiveConversation} className="w-12 h-12 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-100 active:scale-90 transition-all">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
            </button>
            <input 
              type="text" 
              value={inputText} 
              onChange={e => setInputText(e.target.value)} 
              onKeyDown={e => e.key === 'Enter' && handleSendMessage()} 
              placeholder="সবজান্তাকে কিছু জিজ্ঞাসা করুন..." 
              className="flex-1 h-12 px-5 bg-slate-50 rounded-2xl border border-slate-200 focus:bg-white outline-none focus:ring-2 focus:ring-indigo-500/10 transition-all" 
            />
            <button 
              onClick={() => handleSendMessage()} 
              disabled={!inputText.trim() || isTyping} 
              className="w-12 h-12 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl flex items-center justify-center shadow-lg active:scale-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5 rotate-90" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
            </button>
          </div>
        )}
      </div>

      <ShareModal isOpen={isShareModalOpen} onClose={() => setIsShareModalOpen(false)} appUrl={window.location.origin} />
      <InstallGuide isOpen={isInstallGuideOpen} onClose={() => setIsInstallGuideOpen(false)} />
    </div>
  );
};

export default App;
