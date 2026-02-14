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
