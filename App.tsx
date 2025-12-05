import React, { useState } from 'react';
import { AppMode, LogEntry } from './types';
import LiveSession from './components/LiveSession';
import ChatSession from './components/ChatSession';
import TerminalSession from './components/TranscribeSession'; 

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppMode>(AppMode.LIVE);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const handleLog = (entry: LogEntry) => {
    setLogs(prev => [...prev.slice(-99), entry]); 
  };

  const NavButton = ({ mode, icon, label }: { mode: AppMode, icon: React.ReactNode, label: string }) => (
    <button
      onClick={() => setActiveTab(mode)}
      className={`group relative flex items-center justify-center p-3 sm:px-8 transition-all duration-300 w-full sm:w-auto overflow-hidden
        ${activeTab === mode 
          ? 'text-cyan-400' 
          : 'text-slate-600 hover:text-cyan-200'
        }`}
    >
      {/* Active Tab Glow Indicator */}
      {activeTab === mode && (
        <div className="absolute bottom-0 left-0 w-full h-0.5 bg-cyan-500 shadow-[0_0_10px_#06b6d4]"></div>
      )}
      
      {/* Icon & Label */}
      <div className="flex flex-col sm:flex-row items-center gap-2 z-10">
        <div className={`h-5 w-5 transition-transform duration-300 ${activeTab === mode ? 'scale-110 drop-shadow-[0_0_5px_rgba(34,211,238,0.8)]' : ''}`}>
          {icon}
        </div>
        <span className="text-[10px] sm:text-xs font-orbitron tracking-widest uppercase">{label}</span>
      </div>
      
      {/* Background Hover Effect */}
      <div className={`absolute inset-0 bg-gradient-to-t from-cyan-900/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300`}></div>
    </button>
  );

  return (
    <div className="flex flex-col h-full max-w-5xl mx-auto bg-black text-cyan-50 shadow-2xl overflow-hidden sm:border-x sm:border-slate-900 relative">
      
      {/* Global Background Grid */}
      <div className="absolute inset-0 grid-bg opacity-30 pointer-events-none z-0"></div>
      
      {/* Header */}
      <header className="hidden sm:flex items-center justify-between p-6 border-b border-white/5 bg-black/80 backdrop-blur-md z-20 relative">
        <div className="flex items-center gap-4">
            <div className="relative">
                <div className="absolute -inset-1 bg-cyan-500 rounded-full blur opacity-25"></div>
                <div className="relative bg-black border border-cyan-500/50 p-2 rounded-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                </div>
            </div>
            <div>
                <h1 className="text-2xl font-orbitron font-bold tracking-tighter text-white">
                    OMNI<span className="text-cyan-500">VOICE</span>
                </h1>
                <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                    <span className="text-[10px] text-slate-500 tracking-[0.2em] uppercase">System Online</span>
                </div>
            </div>
        </div>
        <div className="flex items-center gap-4">
            <div className="text-right hidden md:block">
                <div className="text-[10px] text-slate-500 uppercase tracking-widest">Model Architecture</div>
                <div className="text-xs font-bold text-cyan-500 font-orbitron">GEMINI 2.5 PROTOCOL</div>
            </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative z-10">
        <div className="h-full w-full" style={{ display: activeTab === AppMode.LIVE ? 'block' : 'none' }}>
            <LiveSession onChangeTab={setActiveTab} onLog={handleLog} />
        </div>

        {activeTab === AppMode.CHAT && <ChatSession />}
        {activeTab === AppMode.TERMINAL && <TerminalSession logs={logs} />}
      </main>

      {/* Bottom Navigation HUD */}
      <nav className="p-0 bg-black/90 border-t border-cyan-500/20 z-30 backdrop-blur-xl">
        <div className="flex justify-between sm:justify-center sm:gap-12">
          <NavButton 
            mode={AppMode.LIVE} 
            label="Neural Core"
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
            } 
          />
          <NavButton 
            mode={AppMode.CHAT} 
            label="Comms Uplink"
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            } 
          />
          <NavButton 
            mode={AppMode.TERMINAL} 
            label="Sys Logs"
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
              </svg>
            } 
          />
        </div>
      </nav>
    </div>
  );
};

export default App;