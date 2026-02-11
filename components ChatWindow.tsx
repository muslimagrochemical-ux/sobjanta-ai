
import React, { useEffect, useRef } from 'react';
import { Message } from '../types.ts';

interface ChatWindowProps {
  messages: Message[];
  onHintClick: (hint: string) => void;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ messages, onHintClick }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center justify-center">
        <div className="max-w-md w-full text-center space-y-8 animate-in fade-in duration-1000">
          <div className="w-24 h-24 bg-indigo-600 rounded-[2rem] flex items-center justify-center shadow-2xl mx-auto transform rotate-3 animate-subtle">
             <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
             </svg>
          </div>
          <div>
            <h2 className="text-3xl font-black text-slate-900 mb-2">সালাম, আমি সবজান্তা! 👋</h2>
            <p className="bn-font text-slate-500 font-medium text-sm leading-relaxed">
              জুবায়ের তালুকদারের তৈরি আপনার স্মার্ট এআই বন্ধু। আজ আপনাকে কীভাবে সাহায্য করতে পারি?
            </p>
          </div>
          
          <div className="grid grid-cols-2 gap-3 w-full">
            {["ছবি আঁকো", "আজকের খবর", "সিরাজগঞ্জ", "কবিতা"].map(hint => (
              <button 
                key={hint} 
                onClick={() => onHintClick(hint)}
                className="p-4 bg-white border border-slate-100 rounded-2xl text-xs text-slate-700 font-bold hover:border-indigo-400 hover:bg-indigo-50 transition-all shadow-sm active:scale-95"
              >
                "{hint}"
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-8 scroll-smooth pb-20">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}
        >
          <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} max-w-[90%]`}>
            <div
              className={`rounded-2xl p-5 shadow-sm ${
                msg.role === 'user'
                  ? 'message-user text-white rounded-tr-none'
                  : 'bg-white text-slate-800 border border-slate-100 rounded-tl-none'
              }`}
            >
              <div className="whitespace-pre-wrap leading-relaxed text-[15px] bn-font">
                {msg.content}
              </div>
              
              {msg.groundingSources && msg.groundingSources.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-100/20">
                  <p className="text-[9px] font-black uppercase tracking-widest mb-2 opacity-60">তথ্যসূত্র:</p>
                  <div className="flex flex-wrap gap-2">
                    {msg.groundingSources.map((source, idx) => (
                      <a
                        key={idx}
                        href={source.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-indigo-600 bg-white/10 px-3 py-1.5 rounded-lg border border-indigo-100/20 font-bold hover:bg-indigo-600 hover:text-white transition-all"
                      >
                        {source.title}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <span className="text-[9px] text-slate-400 font-black uppercase mt-2 tracking-widest px-1">
              {msg.role === 'user' ? 'আপনি' : 'সবজান্তা'} • {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ChatWindow;
