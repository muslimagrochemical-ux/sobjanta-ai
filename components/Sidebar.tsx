
import React from 'react';
import { ChatSession } from '../types.ts';

interface SidebarProps {
  sessions: ChatSession[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDeleteSession: (id: string) => void;
  onLogout: () => void;
  onOpenAbout: () => void;
  onOpenShare: () => void;
  onOpenInstall: () => void;
  userName: string;
  isOpen: boolean;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  sessions, 
  currentSessionId, 
  onSelectSession, 
  onNewChat, 
  onDeleteSession,
  onLogout,
  onOpenAbout,
  onOpenShare,
  onOpenInstall,
  userName,
  isOpen,
  onClose
}) => {
  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-md z-40 md:hidden transition-opacity duration-300"
          onClick={onClose}
        />
      )}
      
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-80 bg-white border-r border-slate-100 flex flex-col transition-all duration-500
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        md:relative md:translate-x-0 ${!isOpen && 'md:hidden'}
      `}>
        {/* Sidebar Header */}
        <div className="p-5 flex items-center justify-between border-b border-slate-50">
          <button 
            onClick={onNewChat}
            className="flex-1 py-3.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl flex items-center justify-center gap-2.5 transition-all shadow-xl shadow-indigo-100 font-bold text-sm active:scale-95 group"
          >
            <svg className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
            </svg>
            নতুন চ্যাট
          </button>
          
          <button 
            onClick={onClose} 
            className="md:hidden ml-3 p-2.5 bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-xl transition-all active:scale-90"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Quick Menu */}
        <div className="px-3 py-4 space-y-1">
          <button
            onClick={onOpenAbout}
            className="w-full text-left px-4 py-3 rounded-xl text-sm font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 flex items-center gap-3 transition-all active:scale-95"
          >
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 font-black">J</div>
            জুবায়ের তালুকদার
          </button>
          <button
            onClick={onOpenShare}
            className="w-full text-left px-4 py-3 rounded-xl text-sm font-bold text-slate-600 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-3 transition-all active:scale-95"
          >
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 100-2.684 3 3 0 000 2.684zm0 12.684a3 3 0 100-2.684 3 3 0 000 2.684z" /></svg>
            </div>
            শেয়ার করুন
          </button>
        </div>

        {/* History Section */}
        <div className="flex-1 overflow-y-auto px-3 space-y-1 pb-4">
          <div className="px-4 mt-6 mb-3 flex items-center gap-3">
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ইতিহাস</p>
             <div className="h-[1px] flex-1 bg-slate-100"></div>
          </div>
          
          {sessions.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-slate-400 bn-font">কোনো ইতিহাস নেই</p>
          ) : (
            sessions.map(session => (
              <div key={session.id} className="group relative">
                <button
                  onClick={() => onSelectSession(session.id)}
                  className={`w-full text-left px-4 py-4 rounded-2xl text-sm truncate transition-all pr-12 ${
                    currentSessionId === session.id 
                      ? 'bg-indigo-50 text-indigo-700 font-bold' 
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="bn-font">{session.title || 'শিরোনামহীন'}</span>
                </button>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSession(session.id);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all active:scale-90"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>

        {/* User Profile */}
        <div className="p-5 border-t border-slate-50 bg-slate-50/50">
          <div className="flex items-center gap-3 mb-4 p-3 bg-white rounded-2xl border border-slate-100">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-black text-lg uppercase shadow-lg shadow-indigo-100">
              {userName[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-slate-800 truncate">{userName}</p>
              <p className="text-[9px] text-green-500 font-black uppercase tracking-widest">অনলাইন</p>
            </div>
          </div>
          <button 
            onClick={onLogout}
            className="w-full py-3 text-xs text-red-500 font-bold hover:bg-red-50 rounded-xl transition-all flex items-center justify-center gap-2 border border-transparent hover:border-red-100"
          >
            লগআউট করুন
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
