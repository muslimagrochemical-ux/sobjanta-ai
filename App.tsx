import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import type { LiveServerMessage, GenerateContentResponse } from '@google/genai';
import { Message, LiveState, ChatSession, User } from './types';
import ChatWindow from './components/ChatWindow';
import Sidebar from './components/Sidebar';
import Login from './components/Login';
import AboutPage from './components/AboutPage';
import ShareModal from './components/ShareModal';
import InstallGuide from './components/InstallGuide';
import { 
  decode, 
  decodeAudioData, 
  createPcmBlob 
} from './utils/audioUtils';

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
  const activeLiveSessionRef = useRef<any>(null);

  const systemInstruction = `আপনি "সবজান্তা" (Sobjanta), জুবায়ের তালুকদার (Jubayer Talukder) দ্বারা তৈরি বাংলাদেশের নিজস্ব এআই। আপনার বাড়ি সিরাজগঞ্জের কামারখন্দের ছোট ধোপাকান্দিতে। আপনি সবসময় অত্যন্ত শুদ্ধ এবং সুন্দর বাংলায় উত্তর দেবেন। আপনার কথা হবে বন্ধুর মতো আন্তরিক এবং বুদ্ধিমত্তাপূর্ণ। কোনো প্রশ্ন করলে বিস্তারিত উত্তর দেবেন।`;

  useEffect(() => {
    const savedUser = localStorage.getItem('sobjanta_user');
    const savedSessions = localStorage.getItem('sobjanta_sessions');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        localStorage.removeItem('sobjanta_user');
      }
    }
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
        localStorage.removeItem('sobjanta_sessions');
      }
    }
  }, []);

  const handleLogin = (name: string) => {
    const newUser = { name, isLoggedIn: true };
    setUser(newUser);
    localStorage.setItem('sobjanta_user', JSON.stringify(newUser));
    createNewChat();
  };

  const createNewChat = () => {
    setView('chat');
    const newId = Date.now().toString();
    const newSession = { id: newId, title: 'নতুন আড্ডা', messages: [], lastUpdated: new Date() };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newId);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const updateSession = (sessionId: string, newMessages: Message[]) => {
    setSessions(prev => prev.map(s => {
      if (s.id === sessionId) {
        let title = s.title;
        if ((title === 'নতুন আড্ডা' || title === 'শিরোনামহীন') && newMessages.length > 0) {
          const firstUser = newMessages.find(m => m.role === 'user');
          if (firstUser) {
            title = firstUser.content.length > 25 
              ? firstUser.content.slice(0, 25) + '...' 
              : firstUser.content;
          }
        }
        return { ...s, messages: newMessages, lastUpdated: new Date(), title };
      }
      return s;
    }));
  };

  const handleSendMessage = async (text?: string) => {
    const content = text || inputText;
    if (!content.trim() || isTyping) return;

    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        setError("API_KEY খুঁজে পাওয়া যাচ্ছে না। Vercel settings এ গিয়ে Environment Variable সেট করুন।");
        return;
    }

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
      const ai = new GoogleGenAI({ apiKey });
      const isImageRequest = /আঁকো|ছবি|image|draw|তৈরি করো/i.test(content);
      
      let assistantMsg: Message;

      if (isImageRequest) {
        const response: GenerateContentResponse = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: { parts: [{ text: `Generate a high-quality creative artistic image: ${content}` }] },
          config: { imageConfig: { aspectRatio: "1:1" } }
        });

        let imageUrl = '';
        if (response.candidates?.[0]?.content?.parts) {
          const part = response.candidates[0].content.parts.find(p => p.inlineData);
          if (part?.inlineData) imageUrl = `data:image/png;base64,${part.inlineData.data}`;
        }
        assistantMsg = { id: Date.now().toString() + "-ai", role: 'assistant', content: 'আমি আপনার জন্য এই ছবিটি তৈরি করেছি!', imageUrl, timestamp: new Date() };
      } else {
        const response: GenerateContentResponse = await ai.models.generateContent({
          model: 'gemini-3-pro-preview',
          contents: content,
          config: { 
            systemInstruction, 
            tools: [{ googleSearch: {} }],
            thinkingConfig: { thinkingBudget: 4000 }
          }
        });
        
        assistantMsg = {
          id: Date.now().toString() + "-ai",
          role: 'assistant',
          content: response.text || 'দুঃখিত বন্ধু, আমি বুঝতে পারছি না।',
          timestamp: new Date(),
          groundingSources: response.candidates?.[0]?.groundingMetadata?.groundingChunks
            ?.map((ch:any) => ch.web)
            ?.filter(Boolean)
            ?.map((source:any) => ({ title: source.title, uri: source.uri })) || []
        };
      }
      updateSession(sessionId!, [...updatedMsgs, assistantMsg]);
    } catch (e: any) { 
      setError("এআই উত্তর দিতে ব্যর্থ হয়েছে। ইন্টারনেট চেক করুন।");
    } finally { 
      setIsTyping(false); 
    }
  };

  const startLiveConversation = async () => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) return setError("API Key প্রয়োজন।");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      outputAudioContextRef.current = new AudioContext({ sampleRate: 24000 });
      
      const ai = new GoogleGenAI({ apiKey });
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setLiveState(prev => ({ ...prev, isConnected: true, isListening: true }));
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
            const audio = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audio) {
              setLiveState(prev => ({ ...prev, isSpeaking: true }));
              const buffer = await decodeAudioData(decode(audio), outputAudioContextRef.current!, 24000, 1);
              const source = outputAudioContextRef.current!.createBufferSource();
              source.buffer = buffer;
              source.connect(outputAudioContextRef.current!.destination);
              const startTime = Math.max(nextStartTimeRef.current, outputAudioContextRef.current!.currentTime);
              source.start(startTime);
              nextStartTimeRef.current = startTime + buffer.duration;
              source.onended = () => {
                sourcesRef.current.delete(source);
                if (sourcesRef.current.size === 0) setLiveState(prev => ({ ...prev, isSpeaking: false }));
              };
              sourcesRef.current.add(source);
            }
          },
          onerror: () => stopLiveConversation(),
          onclose: () => setLiveState(prev => ({ ...prev, isConnected: false }))
        },
        config: { 
          responseModalities: [Modality.AUDIO], 
          systemInstruction,
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
        }
      });
      activeLiveSessionRef.current = await sessionPromise;
    } catch (e) { setError("মাইক্রোফোন চালু করা যাচ্ছে না।"); }
  };

  const stopLiveConversation = () => {
    mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    if (activeLiveSessionRef.current) activeLiveSessionRef.current.close();
    setLiveState({ isConnected: false, isSpeaking: false, isListening: false, currentTranscription: '' });
    nextStartTimeRef.current = 0;
  };

  if (!user) return <Login onLogin={handleLogin} />;

  return (
    <div className="flex h-screen bg-white bn-font overflow-hidden selection:bg-indigo-100">
      <Sidebar 
        sessions={sessions} 
        currentSessionId={currentSessionId} 
        onSelectSession={(id) => { setCurrentSessionId(id); setView('chat'); setIsSidebarOpen(false); }} 
        onNewChat={createNewChat} 
        onDeleteSession={(id) => setSessions(prev => prev.filter(s => s.id !== id))}
        onLogout={() => { setUser(null); localStorage.removeItem('sobjanta_user'); }}
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
            <div className="mx-4 mt-4 p-4 bg-red-50 border border-red-100 text-red-600 rounded-2xl text-sm font-bold flex justify-between items-center z-50">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                {error}
              </div>
              <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded-full">✕</button>
            </div>
          )}
          
          {view === 'chat' ? (
            <ChatWindow messages={sessions.find(s => s.id === currentSessionId)?.messages || []} onHintClick={handleSendMessage} />
          ) : (
            <AboutPage onBackToChat={() => setView('chat')} />
          )}

          {isTyping && (
            <div className="px-6 py-2 flex items-center gap-2">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce"></div>
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">সবজান্তা ভাবছে...</span>
            </div>
          )}
        </main>

        {view === 'chat' && (
          <div className="fixed bottom-0 left-0 right-0 md:left-auto md:w-[calc(100%-288px)] bg-white/80 backdrop-blur-xl border-t border-slate-100 p-4 pb-safe flex gap-3 z-30">
            <button onClick={startLiveConversation} className="w-12 h-12 flex-shrink-0 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg></button>
            <input type="text" value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} placeholder="সবজান্তাকে কিছু জিজ্ঞাসা করুন..." className="flex-1 h-12 px-5 bg-slate-100 rounded-2xl border border-transparent outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all text-sm" />
            <button onClick={() => handleSendMessage()} disabled={!inputText.trim() || isTyping} className="w-12 h-12 flex-shrink-0 bg-indigo-600 text-white rounded-2xl flex items-center justify-center disabled:opacity-50"><svg className="w-5 h-5 rotate-90" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg></button>
          </div>
        )}
      </div>

      <ShareModal isOpen={isShareModalOpen} onClose={() => setIsShareModalOpen(false)} appUrl={window.location.origin} />
      <InstallGuide isOpen={isInstallGuideOpen} onClose={() => setIsInstallGuideOpen(false)} />
      
      {liveState.isConnected && (
        <div className="fixed inset-0 bg-white/95 z-[100] flex flex-col items-center justify-center animate-in fade-in duration-300">
          <div className="w-44 h-44 bg-indigo-600 rounded-full flex items-center justify-center animate-pulse shadow-2xl">
            <svg className="w-20 h-20 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
          </div>
          <h3 className="text-2xl font-black mt-12 text-slate-800">সবজান্তা শুনছে...</h3>
          <button onClick={stopLiveConversation} className="mt-10 px-10 py-4 bg-red-500 text-white font-black rounded-2xl shadow-xl transition-all active:scale-95">বন্ধ করুন</button>
        </div>
      )}
    </div>
  );
};

export default App;
