import React, { useEffect, useRef, useState } from 'react';
import { getGeminiClient, generateTextResponse } from '../services/geminiService';
import { createPcmBlob, decodeBase64, decodeAudioData, blobToBase64 } from '../utils/audioUtils';
import { LiveServerMessage, Modality, FunctionDeclaration, Type } from '@google/genai';
import { AppMode, ChatModelType, LogEntry } from '../types';

interface LiveSessionProps {
  onSetReminder?: (message: string, delaySeconds: number) => void;
  onChangeTab?: (mode: AppMode) => void;
  onLog: (entry: LogEntry) => void;
}

interface TaskState {
  isActive: boolean;
  appName?: string;
  actionDescription?: string;
  status: 'idle' | 'opening' | 'searching' | 'processing' | 'payment' | 'completed';
  details?: any;
}

type WidgetData = 
  | { type: 'weather', data: { location: string, temp: number, condition: string } }
  | { type: 'stock', data: { symbol: string, price: number, history: number[] } }
  | { type: 'map', data: { location: string, lat: number, lng: number } }
  | { type: 'note', data: { title: string, content: string } };

const LiveSession: React.FC<LiveSessionProps> = ({ onSetReminder, onChangeTab, onLog }) => {
  const [isActive, setIsActive] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [status, setStatus] = useState<string>("SYSTEM STANDBY");
  const [volume, setVolume] = useState(0);
  
  const [task, setTask] = useState<TaskState>({ isActive: false, status: 'idle' });
  const [activeWidget, setActiveWidget] = useState<WidgetData | null>(null);

  const [position, setPosition] = useState({ x: 20, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const frameIntervalRef = useRef<number | null>(null);

  const addLog = (message: string, type: 'info' | 'tool' | 'error' | 'thought' = 'info') => {
    const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second:'2-digit' });
    onLog({ time, message, type });
  };

  const renderWidgetTool: FunctionDeclaration = {
    name: "render_widget",
    description: "Visually render a UI widget on the user's screen to display data richly.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        widget_type: { 
            type: Type.STRING, 
            description: "Type of widget to render. Values: 'weather_card', 'stock_chart', 'map_view', 'note_pad'." 
        },
        data: {
            type: Type.OBJECT,
            description: "JSON data for the widget.",
            properties: {
                location: { type: Type.STRING },
                temp: { type: Type.NUMBER },
                condition: { type: Type.STRING },
                symbol: { type: Type.STRING },
                price: { type: Type.NUMBER },
                title: { type: Type.STRING },
                content: { type: Type.STRING },
            }
        }
      },
      required: ["widget_type", "data"]
    }
  };

  const reminderTool: FunctionDeclaration = {
    name: "set_reminder",
    description: "Set a voice reminder.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        delay_seconds: { type: Type.NUMBER },
        message: { type: Type.STRING }
      },
      required: ["delay_seconds", "message"]
    }
  };

  const changeTabTool: FunctionDeclaration = {
    name: "change_tab",
    description: "Switch application tab.",
    parameters: {
      type: Type.OBJECT,
      properties: { tab_name: { type: Type.STRING } },
      required: ["tab_name"]
    }
  };

  const weatherTool: FunctionDeclaration = {
    name: "get_weather",
    description: "Get current weather.",
    parameters: {
      type: Type.OBJECT,
      properties: { location: { type: Type.STRING } },
      required: ["location"]
    }
  };

  const stockTool: FunctionDeclaration = {
    name: "get_stock_price",
    description: "Get stock price.",
    parameters: {
      type: Type.OBJECT,
      properties: { symbol: { type: Type.STRING } },
      required: ["symbol"]
    }
  };

  const openAppTool: FunctionDeclaration = {
    name: "open_app",
    description: "Open a specific application.",
    parameters: {
      type: Type.OBJECT,
      properties: { app_name: { type: Type.STRING } },
      required: ["app_name"]
    }
  };

  const orderFoodTool: FunctionDeclaration = {
    name: "order_food",
    description: "Order food from a delivery app.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        app_name: { type: Type.STRING },
        item: { type: Type.STRING },
        quantity: { type: Type.NUMBER }
      },
      required: ["item"]
    }
  };

  const searchTool: FunctionDeclaration = {
    name: "search_web",
    description: "Search the internet for real-time info. Returns a summary.",
    parameters: {
      type: Type.OBJECT,
      properties: { query: { type: Type.STRING } },
      required: ["query"]
    }
  };

  const cleanupAudio = () => {
    sourcesRef.current.forEach(s => s.stop());
    sourcesRef.current.clear();
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(t => t.stop());
      audioStreamRef.current = null;
    }
    if (inputContextRef.current) {
      inputContextRef.current.close();
      inputContextRef.current = null;
    }
    if (outputContextRef.current) {
      outputContextRef.current.close();
      outputContextRef.current = null;
    }
    sessionPromiseRef.current?.then(session => session.close()).catch(() => {});
    sessionPromiseRef.current = null;
  };

  const cleanupVideo = () => {
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach(t => t.stop());
      videoStreamRef.current = null;
    }
  };

  const startVideo = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      videoStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      frameIntervalRef.current = window.setInterval(() => {
        captureAndSendFrame();
      }, 500);
      setIsCameraActive(true);
      addLog("Visual Sensors: Online", "info");
    } catch (err) {
      console.error("Camera access failed", err);
      setIsCameraActive(false);
    }
  };

  const stopVideo = () => {
    cleanupVideo();
    setIsCameraActive(false);
  };

  const captureAndSendFrame = () => {
    if (!videoRef.current || !canvasRef.current || !sessionPromiseRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(async (blob) => {
      if (blob) {
        const base64 = await blobToBase64(blob);
        sessionPromiseRef.current?.then(session => {
          session.sendRealtimeInput({
            media: { mimeType: 'image/jpeg', data: base64 }
          });
        });
      }
    }, 'image/jpeg', 0.5);
  };

  const toggleCamera = () => {
    if (isCameraActive) stopVideo();
    else if (isActive) startVideo();
    else alert("Connect to Agent first.");
  };

  const handlePayment = () => {
    setTask(prev => ({ ...prev, status: 'completed' }));
    addLog("Payment Authorization: Success", "info");
    setTimeout(() => {
        setTask({ isActive: false, status: 'idle' });
    }, 3000);
  };

  const startSession = async () => {
    if (!process.env.API_KEY) {
        setStatus("Error: API Key missing");
        return;
    }

    try {
      setStatus("INITIALIZING NEURAL LINK...");
      addLog("Initializing Audio Context...", "info");
      setIsActive(true);

      const ai = getGeminiClient();
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      inputContextRef.current = inputCtx;
      outputContextRef.current = outputCtx;
      nextStartTimeRef.current = outputCtx.currentTime;

      const outputNode = outputCtx.createGain();
      outputNode.connect(outputCtx.destination);

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
            sampleRate: 16000
        } 
      });
      audioStreamRef.current = stream;

      setStatus("ESTABLISHING UPLINK...");

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          systemInstruction: `You are Omni, a hyper-intelligent, multimodal AI agent. 
          Your goal is to BE HELPFUL and VISUAL. 
          You have tools: 'search_web', 'order_food', 'open_app', 'render_widget'.
          Whenever you provide data about weather, stocks, locations, or summaries, you MUST use the 'render_widget' tool.
          Use 'search_web' for any knowledge queries. Do NOT ask user to enable it.
          Be concise, witty, and futuristic.`,
          tools: [{ functionDeclarations: [reminderTool, changeTabTool, weatherTool, stockTool, openAppTool, orderFoodTool, searchTool, renderWidgetTool] }],
        },
        callbacks: {
          onopen: () => {
            setStatus("NEURAL LINK ACTIVE");
            addLog("Connection Established", "info");
            
            const source = inputCtx.createMediaStreamSource(stream);
            sourceNodeRef.current = source;
            const processor = inputCtx.createScriptProcessor(2048, 1, 1);
            scriptProcessorRef.current = processor;

            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              let sum = 0;
              for(let i=0; i<inputData.length; i++) sum += inputData[i] * inputData[i];
              setVolume(Math.sqrt(sum / inputData.length));

              const pcmBlob = createPcmBlob(inputData);
              sessionPromise.then(session => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };

            source.connect(processor);
            processor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            const serverContent = message.serverContent;
            
            if (serverContent?.interrupted) {
                addLog("User Interruption Detected", "info");
                sourcesRef.current.forEach(source => { try { source.stop(); } catch(e){} });
                sourcesRef.current.clear();
                nextStartTimeRef.current = outputContextRef.current?.currentTime || 0;
                return;
            }

            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls) {
                addLog(`Exec: ${fc.name}`, "tool");
                let result: any = { result: "ok" };

                try {
                  if (fc.name === 'render_widget') {
                      const type = fc.args['widget_type'] as string;
                      const data = fc.args['data'] as any;
                      if (type === 'weather_card') setActiveWidget({ type: 'weather', data: { location: data.location || 'Unknown', temp: data.temp || 22, condition: data.condition || 'Sunny' } });
                      else if (type === 'stock_chart') setActiveWidget({ type: 'stock', data: { symbol: data.symbol || 'STK', price: data.price || 100, history: Array.from({length: 10}, () => (data.price || 100) + (Math.random() * 10 - 5)) } });
                      else if (type === 'map_view') setActiveWidget({ type: 'map', data: { location: data.location, lat: 35.6762, lng: 139.6503 } });
                      else if (type === 'note_pad') setActiveWidget({ type: 'note', data: { title: data.title || 'Note', content: data.content || '' } });
                      addLog(`Rendering UI: ${type}`, "thought");
                      result = { result: "Widget rendered successfully." };
                  }
                  else if (fc.name === 'set_reminder') {
                    if (onSetReminder) onSetReminder(fc.args['message'] as string, fc.args['delay_seconds'] as number);
                    result = { result: "Reminder set." };
                  } 
                  else if (fc.name === 'change_tab') {
                    const tab = (fc.args['tab_name'] as string).toLowerCase();
                    if (onChangeTab) {
                      if (tab.includes('chat')) onChangeTab(AppMode.CHAT);
                      else if (tab.includes('term')) onChangeTab(AppMode.TERMINAL);
                      else if (tab.includes('live')) onChangeTab(AppMode.LIVE);
                    }
                    result = { result: `Switched view to ${tab}` };
                  }
                  else if (fc.name === 'get_weather') {
                    result = { weather: ["Sunny", "Rainy"][Math.floor(Math.random() * 2)], temperature: 25, unit: "Celsius", location: fc.args['location'] };
                  }
                  else if (fc.name === 'get_stock_price') {
                    result = { symbol: fc.args['symbol'], price: (Math.random() * 1000).toFixed(2), currency: "USD" };
                  }
                  else if (fc.name === 'search_web') {
                    setTask({ isActive: true, appName: 'NetSearch', status: 'searching', actionDescription: `QUERYING GLOBAL NETWORK: "${fc.args['query']}"` });
                    const searchResponse = await generateTextResponse(fc.args['query'] as string, ChatModelType.SEARCH);
                    setTimeout(() => setTask(prev => ({ ...prev, status: 'completed' })), 1000);
                    setTimeout(() => setTask({ isActive: false, status: 'idle' }), 2000);
                    result = { result: searchResponse.text, metadata: { sources: searchResponse.sources } };
                  }
                  else if (fc.name === 'order_food') {
                      setTask({ isActive: true, appName: 'FoodDelivery', status: 'processing', actionDescription: `Ordering ${fc.args['item']}...`, details: { item: fc.args['item'], price: '25.00' } });
                      setTimeout(() => setTask(prev => ({ ...prev, status: 'payment', actionDescription: 'Awaiting Authorization' })), 2000);
                      result = { result: "Order staged. Waiting for payment." };
                  }
                  else if (fc.name === 'open_app') {
                      setTask({ isActive: true, appName: fc.args['app_name'] as string, status: 'opening', actionDescription: 'LAUNCHING...' });
                      setTimeout(() => setTask({ isActive: false, status: 'idle' }), 2000);
                      result = { result: "App opened." };
                  }
                } catch (e) {
                   console.error(e);
                   result = { error: "Tool execution failed" };
                }
                sessionPromise.then((session) => session.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: result } }));
              }
            }

            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
               nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
               const audioBuffer = await decodeAudioData(decodeBase64(base64Audio), outputCtx, 24000, 1);
               const source = outputCtx.createBufferSource();
               source.buffer = audioBuffer;
               source.connect(outputNode);
               source.addEventListener('ended', () => sourcesRef.current.delete(source));
               source.start(nextStartTimeRef.current);
               nextStartTimeRef.current += audioBuffer.duration;
               sourcesRef.current.add(source);
            }
          },
          onclose: () => {
            setStatus("DISCONNECTED");
            setIsActive(false);
          },
          onerror: (err) => {
            setStatus("CONNECTION ERROR");
            addLog("Protocol Failure", "error");
            setIsActive(false);
          }
        }
      });
      sessionPromiseRef.current = sessionPromise;
    } catch (err) {
      setStatus("INITIALIZATION FAILED");
      setIsActive(false);
      cleanupAudio();
    }
  };

  const stopSession = () => {
    setIsActive(false);
    stopVideo();
    cleanupAudio();
    setStatus("SESSION TERMINATED");
    setVolume(0);
    setActiveWidget(null);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) setPosition({ x: e.clientX - dragStartRef.current.x, y: e.clientY - dragStartRef.current.y });
    };
    const handleMouseUp = () => setIsDragging(false);
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  useEffect(() => { return () => stopVideo(); }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full relative overflow-hidden bg-black">
      
      {/* Background Ambience */}
      <div className={`absolute inset-0 transition-all duration-1000 ${isActive ? 'bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-black to-black' : 'bg-black'}`}></div>

      {/* --- Holographic Widgets --- */}
      {activeWidget && (
          <div className="absolute top-24 right-4 md:right-10 z-30 animate-in fade-in slide-in-from-right-10 duration-500">
              {activeWidget.type === 'weather' && (
                  <div className="w-64 bg-black/60 backdrop-blur-xl rounded-none border border-cyan-500/30 p-6 text-cyan-50 shadow-[0_0_20px_rgba(6,182,212,0.15)] relative overflow-hidden group">
                      <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-cyan-400"></div>
                      <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-cyan-400"></div>
                      <div className="flex justify-between items-start z-10 relative">
                          <div>
                              <h3 className="font-orbitron font-bold text-lg tracking-wider">{activeWidget.data.location.toUpperCase()}</h3>
                              <p className="text-cyan-400 text-xs font-mono mt-1">{activeWidget.data.condition}</p>
                          </div>
                      </div>
                      <div className="mt-6 text-5xl font-mono font-bold text-white">{activeWidget.data.temp}°</div>
                  </div>
              )}

              {activeWidget.type === 'stock' && (
                  <div className="w-64 bg-slate-900/80 backdrop-blur-xl border border-green-500/30 p-6 text-white shadow-2xl relative">
                       <div className="flex justify-between items-end mb-4">
                          <div>
                              <p className="text-green-500/50 text-[10px] font-mono tracking-widest">MARKET DATA</p>
                              <h3 className="font-bold text-2xl font-orbitron tracking-wider">{activeWidget.data.symbol}</h3>
                          </div>
                          <div className="text-green-400 font-mono font-bold">${activeWidget.data.price}</div>
                      </div>
                      <div className="h-24 flex items-end justify-between gap-1">
                          {activeWidget.data.history.map((h, i) => (
                              <div key={i} style={{ height: `${(h / (Math.max(...activeWidget.data.history) * 1.1)) * 100}%` }} className="w-full bg-green-500/50 hover:bg-green-400 transition-all duration-500"></div>
                          ))}
                      </div>
                  </div>
              )}

              {activeWidget.type === 'map' && (
                  <div className="w-72 h-48 bg-slate-900/80 backdrop-blur-xl border border-blue-500/30 relative overflow-hidden">
                      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
                      <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-full h-full opacity-30" style={{ backgroundImage: 'linear-gradient(#1e3a8a 1px, transparent 1px), linear-gradient(90deg, #1e3a8a 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
                          <div className="absolute text-cyan-400 animate-pulse">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 drop-shadow-[0_0_10px_rgba(34,211,238,0.8)]" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                              </svg>
                          </div>
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 bg-blue-900/80 backdrop-blur p-2 text-[10px] font-mono text-cyan-300 border-t border-blue-500/30">
                          COORDINATES LOCKED: {activeWidget.data.location.toUpperCase()}
                      </div>
                  </div>
              )}

              <button 
                onClick={() => setActiveWidget(null)}
                className="absolute -top-3 -right-3 bg-black text-red-500 border border-red-500/50 hover:bg-red-900/20 p-1 transition-colors"
              >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
              </button>
          </div>
      )}

      {/* --- HUD Task Simulator --- */}
      {task.isActive && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/90 backdrop-blur-sm transition-opacity">
              <div className="w-80 border border-cyan-500/50 bg-black/80 shadow-[0_0_50px_rgba(6,182,212,0.2)] p-1 relative">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent"></div>
                  <div className="p-6 flex flex-col items-center space-y-6">
                      <div className="w-16 h-16 border-2 border-cyan-500/50 rounded-full flex items-center justify-center bg-cyan-900/20">
                          <span className="text-2xl font-orbitron font-bold text-cyan-400">{task.appName?.charAt(0)}</span>
                      </div>
                      <div className="text-center space-y-2">
                          <h3 className="font-orbitron text-xl text-white tracking-widest">{task.appName?.toUpperCase()}</h3>
                          <p className="text-xs font-mono text-cyan-500 animate-pulse">{task.actionDescription}</p>
                      </div>
                      
                      <div className="w-full h-32 flex items-center justify-center border border-white/10 bg-white/5 relative overflow-hidden">
                          {/* Scanline */}
                          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/10 to-transparent h-2 w-full animate-[scan_2s_linear_infinite]"></div>
                          
                          {task.status === 'opening' && <div className="text-cyan-500 font-mono text-xs">INITIALIZING MODULE...</div>}
                          {task.status === 'searching' && (
                             <div className="flex flex-col gap-2 w-3/4">
                                <div className="h-1 w-full bg-cyan-700/50 animate-pulse"></div>
                                <div className="h-1 w-2/3 bg-cyan-700/50 animate-pulse delay-75"></div>
                                <div className="h-1 w-full bg-cyan-700/50 animate-pulse delay-150"></div>
                             </div>
                          )}
                          {task.status === 'payment' && (
                              <div className="w-full p-2 text-center">
                                  <div className="font-mono text-lg text-white mb-2">${task.details?.price}</div>
                                  <button onClick={handlePayment} className="w-full bg-cyan-600 hover:bg-cyan-500 text-black font-bold py-2 text-xs uppercase tracking-wider transition-all">Authorize Transaction</button>
                              </div>
                          )}
                          {task.status === 'completed' && <div className="text-green-500 font-mono font-bold tracking-widest">TASK COMPLETE</div>}
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* Floating Camera Preview */}
      <div 
        style={{ transform: `translate(${position.x}px, ${position.y}px)`, display: isCameraActive ? 'block' : 'none' }}
        className="fixed top-0 left-0 z-50 w-48 h-36 bg-black border border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.3)] cursor-move"
        onMouseDown={handleMouseDown}
      >
        <div className="absolute top-0 left-0 bg-red-600 text-white text-[9px] px-1 font-mono">REC ●</div>
        <video ref={videoRef} muted playsInline className="w-full h-full object-cover opacity-80" />
        <canvas ref={canvasRef} className="hidden" />
        {/* Corner markers */}
        <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-red-500"></div>
        <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-red-500"></div>
      </div>

      {/* --- Main Agent Interface --- */}
      <div className="relative z-10 flex flex-col items-center justify-center space-y-12 w-full">
        
        {/* Core Visualization */}
        <div className="relative w-80 h-80 flex items-center justify-center">
            {isActive ? (
                <>
                    {/* Outer Rings */}
                    <div className="absolute inset-0 border border-cyan-500/30 rounded-full animate-spin-slow"></div>
                    <div className="absolute inset-4 border border-dashed border-cyan-400/20 rounded-full animate-spin-reverse"></div>
                    <div className="absolute inset-12 border border-blue-500/30 rounded-full animate-spin-slow" style={{ animationDuration: '8s' }}></div>
                    
                    {/* Inner Reactor */}
                    <div className="relative w-40 h-40 rounded-full bg-cyan-500/5 backdrop-blur-sm flex items-center justify-center shadow-[0_0_100px_rgba(6,182,212,0.4)]">
                        <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/20 to-purple-500/20 rounded-full animate-pulse"></div>
                        
                        {/* Audio Reactive Element */}
                         <div className="flex items-center gap-1 h-12">
                             <div className="w-1 bg-cyan-400" style={{ height: `${20 + volume * 100}%`, transition: 'height 0.1s' }}></div>
                             <div className="w-1 bg-cyan-400" style={{ height: `${30 + volume * 140}%`, transition: 'height 0.1s' }}></div>
                             <div className="w-1 bg-cyan-400" style={{ height: `${40 + volume * 180}%`, transition: 'height 0.1s' }}></div>
                             <div className="w-1 bg-cyan-400" style={{ height: `${30 + volume * 140}%`, transition: 'height 0.1s' }}></div>
                             <div className="w-1 bg-cyan-400" style={{ height: `${20 + volume * 100}%`, transition: 'height 0.1s' }}></div>
                         </div>
                    </div>
                </>
            ) : (
                <div className="w-48 h-48 rounded-full border border-slate-800 bg-slate-900/50 flex items-center justify-center relative">
                    <div className="absolute inset-0 border border-slate-800 rounded-full animate-pulse"></div>
                    <span className="text-slate-600 font-mono text-xs tracking-widest">OFFLINE</span>
                </div>
            )}
        </div>

        {/* Status Text */}
        <div className="h-8">
            <p className={`font-mono text-sm tracking-[0.3em] ${isActive ? 'text-cyan-400 animate-pulse' : 'text-slate-600'}`}>
                {status}
            </p>
        </div>

        {/* Controls */}
        <div className="flex gap-6">
            <button
                onClick={isActive ? stopSession : startSession}
                className={`relative group px-8 py-4 bg-transparent overflow-hidden transition-all duration-300
                    ${isActive 
                        ? 'border border-red-500 text-red-500 hover:bg-red-500/10 shadow-[0_0_20px_rgba(239,68,68,0.2)]' 
                        : 'border border-cyan-500 text-cyan-400 hover:bg-cyan-500/10 shadow-[0_0_20px_rgba(6,182,212,0.2)]'
                    }`}
            >
                {/* Decorative corners */}
                <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-current"></div>
                <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-current"></div>
                
                <span className="font-orbitron font-bold tracking-widest text-lg relative z-10">
                    {isActive ? 'TERMINATE' : 'INITIALIZE'}
                </span>
            </button>
            
            {isActive && (
                 <button
                    onClick={toggleCamera}
                    className={`relative p-4 border transition-all duration-300 group
                        ${isCameraActive 
                            ? 'border-red-500 text-red-500 bg-red-900/10' 
                            : 'border-slate-700 text-slate-500 hover:border-cyan-500 hover:text-cyan-400'
                        }`}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <div className={`absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-800 text-[10px] text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity`}>
                        {isCameraActive ? 'DISABLE VISION' : 'ENABLE VISION'}
                    </div>
                </button>
            )}
        </div>
      </div>
    </div>
  );
};

export default LiveSession;