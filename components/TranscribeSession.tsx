import React, { useEffect, useRef } from 'react';
import { LogEntry } from '../types';

interface TerminalSessionProps {
  logs: LogEntry[];
}

const TerminalSession: React.FC<TerminalSessionProps> = ({ logs }) => {
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="flex flex-col h-full bg-black font-mono text-xs relative overflow-hidden">
      {/* CRT Effects */}
      <div className="absolute inset-0 crt-overlay pointer-events-none z-20"></div>
      
      {/* Terminal Header */}
      <div className="flex items-center justify-between p-2 border-b border-green-900/30 bg-green-900/5 z-10">
        <div className="flex items-center gap-2">
            <span className="text-green-600">admin@omnivoice:~$</span>
            <span className="text-green-800 animate-pulse">_</span>
        </div>
        <div className="text-[10px] text-green-900">SYS_DIAGNOSTICS_V2.5</div>
      </div>

      {/* Log Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1 relative z-10">
        {logs.length === 0 ? (
          <div className="text-green-900/50 italic mt-10 text-center">
             NO SYSTEM ACTIVITY DETECTED...
          </div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="flex gap-3 font-mono animate-in slide-in-from-left-2 duration-100">
              <span className="text-slate-600 shrink-0 select-none">[{log.time}]</span>
              <span className={`break-all ${
                  log.type === 'tool' ? 'text-yellow-500' : 
                  log.type === 'error' ? 'text-red-500 bg-red-900/10 px-1' : 
                  log.type === 'thought' ? 'text-cyan-600 italic' : 
                  'text-green-500'
              }`}>
                  {log.type === 'tool' && '>> EXEC_TOOL: '}
                  {log.type === 'thought' && '// INTERNAL_PROCESS: '}
                  {log.type === 'error' && '!! CRITICAL_FAILURE: '}
                  {log.message}
              </span>
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
};

export default TerminalSession;