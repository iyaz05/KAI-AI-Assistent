import { GoogleGenAI, Modality } from "@google/genai";
import { ChatModelType, GroundingSource, ChatMessage, VoiceName } from "../types";

// Helper to get API Key safely
const getApiKey = () => {
  const key = process.env.API_KEY;
  if (!key) {
    console.error("API_KEY is missing from environment variables.");
    return "";
  }
  return key;
};

// -- 1. Chat & Search Service --
export const generateTextResponse = async (
  prompt: string,
  modelType: ChatModelType,
  history: ChatMessage[] = [],
  image?: { data: string; mimeType: string }
): Promise<{ text: string; sources?: GroundingSource[] }> => {
  try {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const modelName = modelType === ChatModelType.FAST 
      ? 'gemini-flash-lite-latest' 
      : 'gemini-2.5-flash';

    const tools = modelType === ChatModelType.SEARCH ? [{ googleSearch: {} }] : undefined;

    // Convert internal ChatMessage history to Gemini Content format
    // We strictly limit context to the last 50 messages to manage token usage while keeping recent context.
    const pastContent = history.slice(-50).map(msg => {
      const parts: any[] = [{ text: msg.text }];
      // Note: We are strictly sending text history for efficiency, 
      // but if we wanted to support multimodal history, we'd add inlineData here if msg.image exists.
      return {
        role: msg.role,
        parts: parts
      };
    });

    const currentParts: any[] = [{ text: prompt }];
    if (image) {
      currentParts.push({
        inlineData: {
          data: image.data,
          mimeType: image.mimeType
        }
      });
    }

    const response = await ai.models.generateContent({
      model: modelName,
      contents: [
        ...pastContent,
        {
          role: 'user',
          parts: currentParts
        }
      ],
      config: {
        tools: tools,
        // System instruction to give the model temporal context
        systemInstruction: `Current date and time: ${new Date().toLocaleString()}. You are a helpful assistant with a memory of our past conversations.`
      }
    });

    let text = response.text || "";
    
    // Extract grounding metadata if available
    let sources: GroundingSource[] = [];
    if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
        response.candidates[0].groundingMetadata.groundingChunks.forEach((chunk: any) => {
            if (chunk.web) {
                sources.push({ title: chunk.web.title, uri: chunk.web.uri });
            }
        });
    }
    
    // Fallback: If text is empty but we have sources/chunks, sometimes the model returns it differently.
    // For search grounding, usually the text contains the synthesized answer. 
    if (!text && sources.length > 0) {
        text = "I found some results on the web. (See sources)";
    } else if (!text) {
        text = "I couldn't generate a response.";
    }

    return { text, sources };
  } catch (error) {
    console.error("Error generating text:", error);
    throw error;
  }
};

// -- 2. Transcription Service --
export const transcribeAudio = async (base64Audio: string, mimeType: string): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
            { inlineData: { mimeType, data: base64Audio } },
            { text: "Transcribe this audio exactly as spoken." }
        ]
      }
    });
    return response.text || "No transcription available.";
  } catch (error) {
    console.error("Transcription error:", error);
    throw error;
  }
};

// -- 3. TTS Service --
export const generateSpeech = async (text: string, voiceName: VoiceName = 'Kore'): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: {
        parts: [{ text: text }]
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voiceName },
            },
        },
      }
    });

    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioData) throw new Error("No audio data returned");
    return audioData;
  } catch (error) {
    console.error("TTS Error:", error);
    throw error;
  }
};

// -- 4. Live API Connection Helper --
// Always create a new instance to ensure the latest API Key is used
export const getGeminiClient = () => new GoogleGenAI({ apiKey: getApiKey() });