
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

  // System instructions to define Sobjanta's persona
  const systemInstruction = `আপনি সবজান্তা (Sobjanta), জুবায়ের তালুকদার (Jubayer Talukder) দ্বারা তৈরি একজন অত্যন্ত স্মার্ট এবং বিনয়ী এআই বন্ধু। আপনার জন্ম সিরাজগঞ্জের কামারখন্দের ছোট ধোপাকান্দিতে। 
  আপনি সবসময় বাংলা ভাষায় উত্তর দেবেন। ব্যবহারকারীর সাথে বন্ধুর মতো ব্যবহার করবেন। আপনার কাজ হলো মানুষকে সাহায্য করা এবং জটিল বিষয় সহজ করে বুঝিয়ে বলা।`;

  useEffect(() => {
    const savedUser = localStorage.getItem('sobjanta_user');
    const savedSessions = localStorage.getItem('sobjanta_sessions');
    
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    
    if (savedSessions) {
      try {
        const parsed = JSON.parse(savedSessions);
        const formattedSessions = parsed.map((s: any) => ({
          ...s,
          lastUpdated: new Date(s.lastUpdated),
          messages: s.messages.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }))
        }));
        setSessions(formattedSessions);
        if (formattedSessions.length > 0) {
          setCurrentSessionId(formattedSessions[0].id);
        }
      } catch (e) {
        console.error("Error loading sessions", e);
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

  const currentMessages = sessions.find(s => s.id === currentSessionId)?.messages || [];

  const updateSession = (sessionId: string, newMessages: Message[]) => {
    setSessions(prev => prev.map(s => {
      if (s.id === sessionId) {
        let newTitle = s.title;
        if ((s.title === 'নতুন চ্যাট') && newMessages.length > 0) {
          const firstUserMsg = newMessages.find(m => m.role === 'user');
          if (firstUserMsg) {
            newTitle = firstUserMsg.content.slice(0, 30) + (firstUserMsg.content.length > 30 ? '...' : '');
          }
        }
        return { ...s, messages: newMessages, lastUpdated: new Date(), title: newTitle };
      }
      return s;
    }));
  };

  const handleSendMessage = async (text?: string) => {
    if (view !== 'chat') setView('chat');
    const content = text || inputText;
    if (!content.trim()) return;

    let sessionId = currentSessionId;
    if (!sessionId) {
      sessionId = Date.now().toString();
      const newSession: ChatSession = {
        id: sessionId,
        title: content.slice(0, 30),
        messages: [],
        lastUpdated: new Date(),
      };
      setSessions(prev => [newSession, ...prev]);
      setCurrentSessionId(sessionId);
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    const updatedMsgs = [...currentMessages, userMsg];
    updateSession(sessionId, updatedMsgs);
    setInputText('');
    setIsTyping(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const imageKeywords = ['আঁকো', 'ছবি', 'draw', 'image', 'picture', 'painting'];
      const isImageRequest = imageKeywords.some(keyword => content.toLowerCase().includes(keyword));

      if (isImageRequest) {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: { parts: [{ text: `একটি সুন্দর ছবি তৈরি করুন: ${content}` }] },
          config: { imageConfig: { aspectRatio: "1:1" } }
        });

        let imageUrl = '';
        let assistantContent = 'আপনার জন্য ছবিটি তৈরি করেছি!';
        
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            imageUrl = `data:image/png;base64,${part.inlineData.data}`;
          } else if (part.text) {
            assistantContent = part.text;
          }
        }

        const assistantMsg: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: assistantContent,
          timestamp: new Date(),
          imageUrl: imageUrl || undefined
        };
        updateSession(sessionId!, [...updatedMsgs, assistantMsg]);
      } else {
        const streamResponse = await ai.models.generateContentStream({
          model: 'gemini-3-flash-preview',
          contents: content,
          config: {
            systemInstruction: systemInstruction,
            tools: [{ googleSearch: {} }],
          },
        });

        let fullText = '';
        const assistantId = (Date.now() + 1).toString();
        
        for await (const chunk of streamResponse) {
          const c = chunk as GenerateContentResponse;
          fullText += c.text || '';
          const assistantMsg: Message = {
            id: assistantId,
            role: 'assistant',
            content: fullText,
            timestamp: new Date(),
            groundingSources: c.candidates?.[0]?.groundingMetadata?.groundingChunks?.filter((ch:any) => ch.web).map((ch:any) => ({ title: ch.web.title, uri: ch.web.uri })) || [],
          };
          updateSession(sessionId!, [...updatedMsgs, assistantMsg]);
        }
      }
    } catch (error: any) {
      console.error('Chat error:', error);
      setError(error.message || "নেটওয়ার্ক সমস্যা। দয়া করে আবার চেষ্টা করুন।");
    } finally {
      setIsTyping(false);
    }
  };

  const startLiveConversation = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      
      await audioContextRef.current.resume();
      await outputAudioContextRef.current!.resume();
      
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setLiveState(prev => ({ ...prev, isConnected: true, isListening: true }));
            const source = audioContextRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = scriptProcessor;
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createPcmBlob(inputData);
              sessionPromise.then((session) => {
                if (session) session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(audioContextRef.current!.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              setLiveState(prev => ({ ...prev, isSpeaking: true }));
              const outCtx = outputAudioContextRef.current!;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outCtx.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), outCtx, 24000, 1);
              const source = outCtx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outCtx.destination);
              source.addEventListener('ended', () => {
                sourcesRef.current.delete(source);
                if (sourcesRef.current.size === 0) setLiveState(prev => ({ ...prev, isSpeaking: false }));
              });
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }

            if (message.serverContent?.interrupted) {
              for (const s of sourcesRef.current) s.stop();
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setLiveState(prev => ({ ...prev, isSpeaking: false }));
            }
          },
          onerror: (e) => {
            console.error('Live Error:', e);
            stopLiveConversation();
            setError("ভয়েস চ্যাটে সমস্যা হচ্ছে।");
          },
          onclose: () => {
            setLiveState(prev => ({ ...prev, isConnected: false, isListening: false, isSpeaking: false }));
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: systemInstruction,
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err) {
      console.error('Mic error:', err);
      setError("মাইক্রোফোন পারমিশন পাওয়া যায়নি।");
    }
  };

  const stopLiveConversation = () => {
    if (sessionRef.current) sessionRef.current.close();
    if (scriptProcessorRef.current) scriptProcessorRef.current.disconnect();
    if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach(t => t.stop());
    setLiveState({ isConnected: false, isSpeaking: false, isListening: false, currentTranscription: '' });
  };

  if (!user) return <Login onLogin={handleLogin} />;

  return (
    <div className="flex h-screen bg-white overflow-hidden bn-font">
      <Sidebar 
        sessions={sessions} 
        currentSessionId={currentSessionId} 
        onSelectSession={(id) => { 
          setCurrentSessionId(id); 
          setView('chat');
          if (window.innerWidth < 768) setIsSidebarOpen(false); 
        }} 
        onNewChat={createNewChat} 
        onLogout={handleLogout}
        onOpenAbout={() => { 
          setView('about'); 
          if (window.innerWidth < 768) setIsSidebarOpen(false); 
        }}
        onOpenShare={() => setIsShareModalOpen(true)}
        onOpenInstall={() => setIsInstallGuideOpen(true)}
        userName={user.name}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />
      
      <div className="flex-1 flex flex-col min-w-0 relative">
        <Header onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />
        
        <main className="flex-1 flex flex-col pt-16 pb-24 overflow-hidden relative">
          {error && (
            <div className="mx-4 mt-4 bg-red-50 text-red-700 px-4 py-3 rounded-2xl flex justify-between items-center z-50 animate-in slide-in-from-top border border-red-100">
              <span className="text-sm font-bold">{error}</span>
              <button onClick={() => setError(null)} className="text-red-400 p-1 hover:text-red-600 transition-colors">&times;</button>
            </div>
          )}

          {view === 'chat' ? (
            <>
              <ChatWindow 
                messages={currentMessages} 
                onHintClick={(hint) => handleSendMessage(hint)}
              />

              {liveState.isConnected && (
                <div className="absolute inset-0 bg-white/95 backdrop-blur-xl z-50 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-500">
                  <div className="relative mb-12">
                    <div className="absolute inset-0 bg-indigo-400 rounded-full blur-3xl opacity-20 animate-pulse"></div>
                    <div className="w-32 h-32 bg-indigo-600 rounded-full flex items-center justify-center shadow-2xl relative z-10 animate-bounce duration-[2000ms]">
                      <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    </div>
                  </div>
                  
                  <h3 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">সবজান্তা শুনছে...</h3>
                  <p className="text-slate-500 bn-font max-w-xs mx-auto mb-10 font-medium">আমি আপনার কথা শোনার জন্য তৈরি। সরাসরি প্রশ্ন করুন বা আড্ডা দিন।</p>
                  
                  <div className="bg-slate-50/50 p-8 rounded-[3rem] border border-slate-100 mb-12 w-full max-w-md">
                    <VoiceWave isActive={liveState.isSpeaking || liveState.isListening} color={liveState.isSpeaking ? 'bg-indigo-600' : 'bg-green-500'} />
                  </div>

                  <button 
                    onClick={stopLiveConversation}
                    className="group flex items-center gap-3 px-10 py-4 bg-red-500 hover:bg-red-600 text-white font-black rounded-2xl shadow-xl shadow-red-100 transition-all active:scale-95"
                  >
                    <span className="w-2 h-2 bg-white rounded-full animate-ping"></span>
                    বন্ধ করুন
                  </button>
                </div>
              )}

              {isTyping && (
                <div className="px-6 py-2 flex items-center gap-2">
                  <div className="flex gap-1.5 items-center">
                    <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mr-2">Sobjanta is thinking</span>
                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce"></div>
                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce delay-75"></div>
                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce delay-150"></div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <AboutPage onBackToChat={() => setView('chat')} />
          )}
        </main>

        <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-slate-100 z-30 pb-safe">
          <div className="max-w-4xl mx-auto p-4 flex items-center gap-3">
            <button
              onClick={liveState.isConnected ? stopLiveConversation : startLiveConversation}
              className={`flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
                liveState.isConnected ? 'bg-red-500 text-white animate-pulse' : 'bg-indigo-600 text-white shadow-lg active:scale-90 hover:bg-indigo-700'
              }`}
              title="ভয়েস চ্যাট শুরু করুন"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </button>

            <div className="flex-1 relative">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="সবজান্তাকে জিজ্ঞাসা করুন..."
                disabled={liveState.isConnected}
                className="w-full h-12 px-5 pr-12 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-slate-700 bg-slate-50 focus:bg-white disabled:opacity-50 font-medium"
              />
              <button
                onClick={() => handleSendMessage()}
                disabled={!inputText.trim() || liveState.isConnected}
                className="absolute right-2 top-2 w-8 h-8 bg-indigo-600 text-white rounded-xl flex items-center justify-center disabled:bg-slate-200 transition-all active:scale-90"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <ShareModal 
        isOpen={isShareModalOpen} 
        onClose={() => setIsShareModalOpen(false)} 
        appUrl={window.location.origin} 
      />
      
      <InstallGuide 
        isOpen={isInstallGuideOpen} 
        onClose={() => setIsInstallGuideOpen(false)} 
      />
    </div>
  );
};

export default App;
