import React, { useState, useRef, useEffect } from 'react';
import { generateTextResponse } from '../services/geminiService';
import { ChatMessage, ChatModelType } from '../types';
import { arrayBufferToBase64 } from '../utils/audioUtils';

const STORAGE_KEY = 'omnivoice_chat_history';

const ChatSession: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<ChatModelType>(ChatModelType.FAST);
  const [selectedImage, setSelectedImage] = useState<{ data: string, mimeType: string } | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const hydrated = parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
        setMessages(hydrated);
      } catch (e) { console.error("Failed to load chat history", e); }
    }
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages)); } catch (e) {}
    }
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleClearMemory = () => {
    if (window.confirm("Purge memory banks?")) {
      setMessages([]);
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const buffer = await file.arrayBuffer();
        const base64 = arrayBufferToBase64(buffer);
        setSelectedImage({ data: base64, mimeType: file.type });
      } catch (err) {}
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSend = async () => {
    if ((!input.trim() && !selectedImage) || isLoading) return;
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: input, timestamp: new Date(), image: selectedImage || undefined };
    setMessages(prev => [...prev, userMsg]);
    const currentInput = input;
    const currentImage = selectedImage;
    setInput('');
    setSelectedImage(null);
    setIsLoading(true);

    try {
      const response = await generateTextResponse(currentInput, mode, messages, currentImage || undefined);
      const botMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: response.text, timestamp: new Date(), sources: response.sources };
      setMessages(prev => [...prev, botMsg]);
    } catch (error) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: "Error: Neural net unresponsive.", timestamp: new Date() }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950/50 relative">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-blue-900/5 to-transparent pointer-events-none"></div>

      {/* Header */}
      <div className="p-4 bg-black/40 backdrop-blur-md border-b border-white/10 flex justify-between items-center z-10">
        <div className="flex items-center gap-2">
           <h3 className="font-orbitron text-sm font-bold text-cyan-400 tracking-wider">ENCRYPTED CHANNEL</h3>
           {messages.length > 0 && (
             <span className="text-[10px] font-mono text-green-500 border border-green-900/50 px-1 rounded bg-green-900/10">MEM_ACTIVE</span>
           )}
        </div>
        
        <div className="flex gap-4 items-center">
            <button 
                onClick={handleClearMemory}
                className="text-red-900 hover:text-red-500 transition-colors text-xs font-mono uppercase"
                title="Purge Memory"
            >
                Purge
            </button>
            <div className="flex bg-slate-900/80 rounded-md p-1 border border-white/5">
                <button onClick={() => setMode(ChatModelType.FAST)} className={`px-3 py-1 text-[10px] font-mono transition-colors ${mode === ChatModelType.FAST ? 'bg-cyan-900/50 text-cyan-400 border border-cyan-500/30' : 'text-slate-500 hover:text-white'}`}>FAST</button>
                <button onClick={() => setMode(ChatModelType.SEARCH)} className={`px-3 py-1 text-[10px] font-mono transition-colors ${mode === ChatModelType.SEARCH ? 'bg-purple-900/50 text-purple-400 border border-purple-500/30' : 'text-slate-500 hover:text-white'}`}>NET_SEARCH</button>
            </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-700 opacity-60">
             <div className="font-mono text-xs border border-dashed border-slate-800 p-4">AWAITING INPUT_</div>
          </div>
        )}
        
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] relative group ${
              msg.role === 'user' 
                ? 'bg-cyan-950/30 border-r-2 border-cyan-500 text-cyan-50' 
                : 'bg-slate-900/50 border-l-2 border-purple-500 text-slate-200'
            } p-4 backdrop-blur-sm`}>
               {/* Tech decoration corners */}
               <div className={`absolute w-2 h-2 border-t border-white/10 ${msg.role === 'user' ? 'right-0 top-0' : 'left-0 top-0'}`}></div>

              {msg.image && (
                 <div className="mb-2">
                    <img src={`data:${msg.image.mimeType};base64,${msg.image.data}`} alt="Upload" className="max-h-48 opacity-80 border border-white/10" />
                 </div>
              )}
              <div className="whitespace-pre-wrap leading-relaxed font-sans text-sm">{msg.text}</div>
              
              {/* Sources */}
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-4 pt-2 border-t border-white/5">
                  <p className="text-[10px] font-mono text-purple-400 mb-2">SOURCE_DATA:</p>
                  <div className="flex flex-wrap gap-2">
                    {msg.sources.map((source, idx) => (
                      <a 
                        key={idx} 
                        href={source.uri} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-[10px] bg-black border border-slate-700 text-slate-400 px-2 py-1 hover:border-cyan-500 hover:text-cyan-400 transition-colors truncate max-w-[200px] font-mono"
                      >
                        {source.title || "UNK_URI"}
                      </a>
                    ))}
                  </div>
                </div>
              )}
              <div className="absolute bottom-1 right-2 text-[9px] text-white/20 font-mono">{msg.timestamp.toLocaleTimeString()}</div>
            </div>
          </div>
        ))}
        {isLoading && (
           <div className="flex justify-start">
             <div className="bg-slate-900/50 border-l-2 border-purple-500 px-4 py-3 flex items-center gap-2">
               <span className="text-xs font-mono text-purple-500 animate-pulse">PROCESSING...</span>
             </div>
           </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 bg-black border-t border-white/10 relative z-20">
        {selectedImage && (
            <div className="absolute bottom-full left-4 mb-2 bg-slate-900 border border-slate-700 p-1 flex items-center gap-2">
                <img src={`data:${selectedImage.mimeType};base64,${selectedImage.data}`} alt="Prev" className="h-8 w-8 object-cover opacity-50" />
                <span className="text-[10px] font-mono text-cyan-500">IMG_BUFFERED</span>
                <button onClick={() => setSelectedImage(null)} className="text-red-500 hover:text-white">×</button>
            </div>
        )}
        <div className="flex items-end gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-3 text-cyan-800 hover:text-cyan-400 transition-colors border border-transparent hover:border-cyan-900 bg-cyan-950/10"
          >
             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
             </svg>
             <input type="file" ref={fileInputRef} onChange={handleImageSelect} accept="image/*" className="hidden" />
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="ENTER COMMAND OR QUERY..."
            className="flex-1 bg-slate-900/30 border border-slate-800 text-cyan-50 rounded-none px-4 py-3 focus:outline-none focus:border-cyan-500 focus:bg-slate-900/80 resize-none h-[50px] font-mono text-sm placeholder-slate-700 transition-all"
          />
          <button
            onClick={handleSend}
            disabled={(!input.trim() && !selectedImage) || isLoading}
            className="bg-cyan-900/20 border border-cyan-800 text-cyan-400 hover:bg-cyan-500 hover:text-black hover:border-cyan-400 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-cyan-400 p-3 transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatSession;