import React, { useState } from 'react';

interface LoginProps {
  onLogin: (name: string) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [name, setName] = useState('');
  const [pass, setPass] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && pass.trim()) {
      onLogin(name);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 px-4">
      <div className="max-w-md w-full bg-white/80 backdrop-blur-lg rounded-3xl shadow-2xl p-10 border border-white/50">
        <div className="text-center mb-10">
          <div className="w-28 h-28 mx-auto mb-6 relative group">
            <div className="absolute inset-0 bg-indigo-200 rounded-full blur-2xl opacity-20 group-hover:opacity-40 transition-opacity"></div>
            <div className="relative w-full h-full rounded-full overflow-hidden shadow-2xl ring-4 ring-white flex items-center justify-center bg-indigo-950">
              <img 
                src="https://api.dicebear.com/7.x/bottts/svg?seed=sobjanta" 
                alt="Sobjanta AI Logo" 
                className="w-full h-full object-cover"
              />
            </div>
          </div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">সবজান্তা (Sobjanta)</h1>
          <p className="text-slate-500 bn-font mt-2 font-medium">আপনার স্মার্ট এআই সঙ্গী</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">আপনার নাম</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-5 py-3.5 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-sm bg-white/50 focus:bg-white"
              placeholder="আপনার নাম লিখুন"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">পাসওয়ার্ড</label>
            <input
              type="password"
              required
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              className="w-full px-5 py-3.5 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-sm bg-white/50 focus:bg-white"
              placeholder="গোপন পিন দিন"
            />
          </div>
          <button
            type="submit"
            className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-black rounded-2xl shadow-xl transition-all transform hover:-translate-y-1 active:scale-95"
          >
            লগইন করুন
          </button>
        </form>

        <div className="mt-12 pt-8 border-t border-slate-100 text-center">
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mb-2">Designed & Developed by</p>
          <p className="text-base font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">জুবায়ের তালুকদার</p>
          <p className="text-[11px] text-slate-500 mt-1 font-medium bn-font">কামারখন্দ, সিরাজগঞ্জ</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
