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
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null);
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

  const systemInstruction = `আপনি সবজান্তা (Sobjanta), জুবায়ের তালুকদার (Jubayer Talukder) দ্বারা তৈরি বাংলাদেশের নিজস্ব এআই। আপনার বাড়ি সিরাজগঞ্জের কামারখন্দে। আপনি সবসময় শুদ্ধ বাংলায় উত্তর দেবেন এবং বন্ধুর মতো আন্তরিক আচরণ করবেন। যদি ব্যবহারকারী কোনো ছবি তৈরি করতে বলে (যেমন: "আঁকো", "ছবি বানাও", "Image", "Draw"), তাহলে আপনি সেই বিষয়ের বর্ণনা দিয়ে ছবি তৈরি করবেন। গুগল ম্যাপস বা সার্চ ব্যবহার করে সঠিক তথ্য দেবেন।`;

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
      } catch (e) { console.error(e); }
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      }, () => console.log("Location access denied."));
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
    setSessions(prev => [{ id: newId, title: 'নতুন আড্ডা', messages: [], lastUpdated: new Date() }, ...prev]);
    setCurrentSessionId(newId);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const updateSession = (sessionId: string, newMessages: Message[]) => {
    setSessions(prev => prev.map(s => {
      if (s.id === sessionId) {
        let title = s.title;
        if ((title === 'নতুন আড্ডা' || title === 'শিরোনামহীন') && newMessages.length > 0) {
          const firstUser = newMessages.find(m => m.role === 'user');
          if (firstUser) title = firstUser.content.slice(0, 20) + (firstUser.content.length > 20 ? '...' : '');
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
      setSessions(prev => [{ id: sessionId!, title: content.slice(0, 20), messages: [], lastUpdated: new Date() }, ...prev]);
      setCurrentSessionId(sessionId);
    }

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content, timestamp: new Date() };
    const currentMsgs = sessions.find(s => s.id === sessionId)?.messages || [];
    const updatedMsgs = [...currentMsgs, userMsg];
    
    updateSession(sessionId!, updatedMsgs);
    setInputText('');
    setIsTyping(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const isImageRequest = /আঁকো|ছবি|image|draw|picture|তৈরি করো/i.test(content);
      const isPlaceRequest = /কোথায়|হোটেল|রেস্টুরেন্ট|ম্যাপ|রাস্তা|কাছে/i.test(content);
      
      let assistantMsg: Message;

      if (isImageRequest) {
        const response: GenerateContentResponse = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: { parts: [{ text: `High resolution photorealistic professional art based on: ${content}. Exquisite details.` }] },
        });

        let imageUrl = '';
        let textResponse = 'এই যে বন্ধু, তোমার জন্য ছবি তৈরি করেছি!';
        if (response.candidates?.[0]?.content?.parts) {
          for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) imageUrl = `data:image/png;base64,${part.inlineData.data}`;
            else if (part.text) textResponse = part.text;
          }
        }
        assistantMsg = { id: Date.now().toString(), role: 'assistant', content: textResponse, imageUrl, timestamp: new Date() };
      } else {
        // Maps tool requires gemini-2.5 series
        const modelToUse = isPlaceRequest ? 'gemini-2.5-flash-latest' : 'gemini-3-pro-preview';
        
        const response: GenerateContentResponse = await ai.models.generateContent({
          model: modelToUse,
          contents: content,
          config: { 
            systemInstruction, 
            tools: isPlaceRequest ? [{ googleMaps: {} }, { googleSearch: {} }] : [{ googleSearch: {} }],
            toolConfig: (isPlaceRequest && location) ? { retrievalConfig: { latLng: { latitude: location.lat, longitude: location.lng } } } : undefined,
            thinkingConfig: { thinkingBudget: 4000 }
          }
        });
        assistantMsg = {
          id: Date.now().toString(),
          role: 'assistant',
          content: response.text || 'কিছু বুঝতে পারলাম না বন্ধু।',
          timestamp: new Date(),
          groundingSources: response.candidates?.[0]?.groundingMetadata?.groundingChunks
            ?.map((ch:any) => ch.web || ch.maps)
            ?.filter(Boolean)
            ?.map((source:any) => ({ title: source.title, uri: source.uri })) || []
        };
      }
      updateSession(sessionId!, [...updatedMsgs, assistantMsg]);
    } catch (e: any) { 
      console.error(e);
      if (e.message?.includes("entity was not found")) {
        setError("API Key-তে সমস্যা! দয়া করে Vercel-এ API_KEY ঠিকমতো সেট করেছেন কি না চেক করুন।");
      } else {
        setError("নেটওয়ার্কের সমস্যা হচ্ছে! আবার চেষ্টা করো বন্ধু।");
      }
    }
    finally { setIsTyping(false); }
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
            if (msg.serverContent?.inputTranscription) {
               setLiveState(prev => ({ ...prev, currentTranscription: msg.serverContent!.inputTranscription!.text }));
            }
            if (msg.serverContent?.outputTranscription) {
               setLiveState(prev => ({ ...prev, currentTranscription: msg.serverContent!.outputTranscription!.text }));
            }
            
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
              sourcesRef.current.add(source);
              source.onended = () => {
                sourcesRef.current.delete(source);
                if (sourcesRef.current.size === 0) setLiveState(prev => ({ ...prev, isSpeaking: false }));
              };
            }
          },
          onerror: () => stopLiveConversation(),
          onclose: () => setLiveState(prev => ({ ...prev, isConnected: false }))
        },
        config: { 
          responseModalities: [Modality.AUDIO], 
          systemInstruction,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
        }
      });
      activeLiveSessionRef.current = await sessionPromise;
    } catch (e) { setError("মাইক্রোফোন চালু করা যাচ্ছে না।"); }
  };

  const stopLiveConversation = () => {
    mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    if (activeLiveSessionRef.current) {
        activeLiveSessionRef.current.close();
        activeLiveSessionRef.current = null;
    }
    sourcesRef.current.forEach(s => {
      try { s.stop(); } catch(e) {}
    });
    sourcesRef.current.clear();
    setLiveState({ isConnected: false, isSpeaking: false, isListening: false, currentTranscription: '' });
  };

  const currentMessages = sessions.find(s => s.id === currentSessionId)?.messages || [];

  if (!user) return <Login onLogin={handleLogin} />;

  return (
    <div className="flex h-screen bg-white bn-font overflow-hidden">
      <Sidebar 
        sessions={sessions} 
        currentSessionId={currentSessionId} 
        onSelectSession={(id) => { setCurrentSessionId(id); setView('chat'); setIsSidebarOpen(false); }} 
        onNewChat={createNewChat} 
        onDeleteSession={(id) => setSessions(prev => prev.filter(s => s.id !== id))}
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
            <div className="m-4 p-4 bg-red-50 border border-red-100 text-red-600 rounded-2xl text-sm font-bold flex justify-between items-center z-50 shadow-lg animate-in slide-in-from-top">
              <span className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                {error}
              </span>
              <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded-full transition-colors">✕</button>
            </div>
          )}
          
          {view === 'chat' ? (
            <>
              <ChatWindow messages={currentMessages} onHintClick={handleSendMessage} />
              
              {liveState.isConnected && (
                <div className="absolute inset-0 bg-white/95 z-50 flex flex-col items-center justify-center animate-in fade-in">
                  <div className="relative mb-12">
                     <div className="w-40 h-40 bg-indigo-600 rounded-full flex items-center justify-center shadow-2xl animate-subtle ring-8 ring-indigo-50">
                        <svg className="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                     </div>
                     <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-full">
                        <VoiceWave isActive={liveState.isSpeaking || liveState.isListening} color="bg-indigo-500" />
                     </div>
                  </div>
                  <div className="max-w-md px-6 text-center">
                    <h3 className="text-2xl font-black mb-4 text-slate-800">সবজান্তা আপনার কথা শুনছে</h3>
                    <div className="min-h-[80px] p-5 bg-slate-50 rounded-2xl border border-slate-100 italic text-slate-600 bn-font mb-10 text-lg shadow-inner">
                      {liveState.currentTranscription || "কথা বলুন বন্ধু..."}
                    </div>
                    <button onClick={stopLiveConversation} className="px-12 py-4 bg-red-500 hover:bg-red-600 text-white font-black rounded-2xl shadow-xl transition-all active:scale-95 flex items-center gap-3 mx-auto">
                       <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                       কথপোকথন বন্ধ করুন
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <AboutPage onBackToChat={() => setView('chat')} />
          )}

          {isTyping && (
            <div className="px-6 py-2 flex items-center gap-2">
              <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce"></div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">সবজান্তা ভাবছে...</span>
            </div>
          )}
        </main>

        {view === 'chat' && (
          <div className="fixed bottom-0 left-0 right-0 md:left-auto md:w-[calc(100%-288px)] bg-white/80 backdrop-blur-xl border-t border-slate-100 p-4 flex gap-3 z-30 shadow-2xl">
            <button onClick={startLiveConversation} className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg active:scale-90 transition-transform"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg></button>
            <input type="text" value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} placeholder="কিছু জিজ্ঞাসা করো বা ছবি আঁকতে বলো..." className="flex-1 h-12 px-5 bg-slate-50 rounded-2xl border border-slate-200 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all" />
            <button onClick={() => handleSendMessage()} disabled={!inputText.trim() || isTyping} className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg active:scale-90 disabled:opacity-50 transition-all"><svg className="w-5 h-5 rotate-90" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg></button>
          </div>
        )}
      </div>

      <ShareModal isOpen={isShareModalOpen} onClose={() => setIsShareModalOpen(false)} appUrl={window.location.origin} />
      <InstallGuide isOpen={isInstallGuideOpen} onClose={() => setIsInstallGuideOpen(false)} />
    </div>
  );
};

export default App;
