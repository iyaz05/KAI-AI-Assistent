import React, { useState } from 'react';
import { generateSpeech } from '../services/geminiService';
import { decodeBase64, decodeAudioData } from '../utils/audioUtils';
import { VoiceName } from '../types';

const voices: VoiceName[] = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];

const TTSSession: React.FC = () => {
  const [text, setText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState<VoiceName>('Kore');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleGenerate = async () => {
    if (!text.trim()) return;

    setIsLoading(true);
    try {
      const base64Audio = await generateSpeech(text, selectedVoice);
      
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const audioBuffer = await decodeAudioData(decodeBase64(base64Audio), ctx, 24000, 1);
      
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      
      source.onended = () => {
        setIsPlaying(false);
        ctx.close();
      };

      setIsPlaying(true);
      source.start();
    } catch (error) {
      console.error("TTS play error", error);
      alert("Failed to generate speech.");
      setIsPlaying(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center h-full p-6 space-y-6">
       <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-white">Text to Speech</h2>
        <p className="text-slate-400 text-sm">Convert text to lifelike audio using Gemini.</p>
      </div>

      <div className="w-full max-w-lg space-y-4">
        {/* Voice Selector */}
        <div className="flex gap-2 items-center bg-slate-800 p-2 rounded-xl border border-slate-700">
            <label className="text-sm text-slate-400 pl-2">Voice:</label>
            <div className="flex-1 flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
                {voices.map(voice => (
                    <button
                        key={voice}
                        onClick={() => setSelectedVoice(voice)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            selectedVoice === voice 
                            ? 'bg-purple-600 text-white' 
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                    >
                        {voice}
                    </button>
                ))}
            </div>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Enter text to speak here..."
          className="w-full h-40 bg-slate-800 border border-slate-700 rounded-xl p-4 text-white focus:ring-2 focus:ring-purple-500 focus:outline-none resize-none placeholder-slate-500"
        />

        <button
          onClick={handleGenerate}
          disabled={!text.trim() || isLoading || isPlaying}
          className="w-full py-4 rounded-xl font-bold text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-900/20 transition-all flex justify-center items-center gap-2"
        >
          {isLoading ? (
             <>
               <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
               <span>Generating...</span>
             </>
          ) : isPlaying ? (
            <>
               <span className="flex space-x-1 h-4 items-end">
                   <span className="w-1 bg-white h-full animate-[wave_1s_ease-in-out_infinite]"></span>
                   <span className="w-1 bg-white h-2/3 animate-[wave_0.8s_ease-in-out_infinite]"></span>
                   <span className="w-1 bg-white h-3/4 animate-[wave_1.2s_ease-in-out_infinite]"></span>
               </span>
               <span>Playing...</span>
            </>
          ) : (
            <>
               <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
               </svg>
               <span>Generate Speech</span>
            </>
          )}
        </button>
      </div>
      
      <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-800 text-xs text-slate-500 max-w-lg text-center">
          Powered by <code>gemini-2.5-flash-preview-tts</code>
      </div>
    </div>
  );
};

export default TTSSession;