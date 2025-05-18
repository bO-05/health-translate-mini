"use client";

import { useState, useEffect, useCallback } from 'react';
import MicButton from "@/components/MicButton";
import TranscriptPane from "@/components/TranscriptPane";
import { ArrowRightLeft, Languages } from 'lucide-react';

export default function HomePage() {
  const [sourceText, setSourceText] = useState(""); // Start empty
  const [translatedText, setTranslatedText] = useState(""); // Start empty
  const [isRecording, setIsRecording] = useState(false);
  const [selectedSourceLang, setSelectedSourceLang] = useState('en-US'); 
  const [selectedTargetLang, setSelectedTargetLang] = useState('es-ES'); // Default target
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false); // Added for TTS
  const [ttsError, setTtsError] = useState<string | null>(null); // Added for TTS

  const supportedLanguages = [
    { code: 'en-US', name: 'English (US)', mistralCode: 'en' },
    { code: 'es-ES', name: 'Español (España)', mistralCode: 'es' },
    { code: 'id-ID', name: 'Bahasa Indonesia', mistralCode: 'id' },
    { code: 'zh-CN', name: '中文 (普通话)', mistralCode: 'zh' },
    { code: 'fr-FR', name: 'Français', mistralCode: 'fr' },
    { code: 'de-DE', name: 'Deutsch', mistralCode: 'de' },
    { code: 'ja-JP', name: '日本語', mistralCode: 'ja' },
    { code: 'ko-KR', name: '한국어', mistralCode: 'ko' },
    // Add more from NEXT_PUBLIC_SUPPORTED_LANGS, ensure mistralCode is the simple 2-letter code for mistral
  ];

  const handleSourceTextUpdate = useCallback((text: string) => {
    setSourceText(text);
    // Simple auto-translate when recording stops and there's text
    // This might need refinement (e.g., debouncing or explicit button if too chatty)
    // For now, let's keep it behind an explicit button click.
  }, []);

  const handleFinalSourceText = useCallback((text: string) => {
    setSourceText(text); // Ensure final text is set
    // Consider auto-translating here if desired, or rely on button
    // handleTranslate(text); // Example: auto-translate on final
  }, []);

  const handleRecordingStateChange = useCallback((recording: boolean) => {
    setIsRecording(recording);
    if (!recording && sourceText.trim() !== "") {
      // Optional: Trigger translation automatically when recording stops and there's source text
      // handleTranslate(sourceText, selectedTargetLang.split('-')[0]);
    }
  }, [sourceText, selectedTargetLang]); // Add dependencies if using them in auto-trigger

  const handleTranslate = async () => {
    if (!sourceText.trim()) {
      setTranslationError("Nothing to translate.");
      setTranslatedText("");
      return;
    }
    setIsTranslating(true);
    setTranslationError(null);
    setTranslatedText("Translating...");

    try {
      const targetLangCode = selectedTargetLang.split('-')[0]; // Use the simple 2-letter code for API
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sourceText, targetLang: targetLangCode, sourceLang: selectedSourceLang.split('-')[0] }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setTranslatedText(data.translatedText);
    } catch (error) {
      console.error("Translation error:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to translate.";
      setTranslationError(`Error: ${errorMessage}`);
      setTranslatedText("Translation failed.");
    }
    setIsTranslating(false);
  };

  const handleSwapLanguages = () => {
    const currentSource = selectedSourceLang;
    const currentTarget = selectedTargetLang;
    setSelectedSourceLang(currentTarget);
    setSelectedTargetLang(currentSource);
    // Optionally, also swap the text in the panes if desired
    // const currentSourceText = sourceText;
    // setSourceText(translatedText);
    // setTranslatedText(currentSourceText);
    // Reset errors if swapping
    setTranslationError(null);
    setTtsError(null);
  };

  const handleSpeak = async () => {
    if (!translatedText.trim() || translationError) {
      setTtsError("Nothing to speak or translation failed.");
      return;
    }
    setIsSpeaking(true);
    setTtsError(null);

    try {
      const targetLangCode = selectedTargetLang.split('-')[0];
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: translatedText, targetLang: targetLangCode }),
      });

      if (!response.ok) {
        let errorData = { error: `TTS API error! status: ${response.status}`, details: "No additional details from API." };
        try {
          errorData = await response.json();
        } catch (e) {
          console.warn("Could not parse JSON from TTS error response.");
        }
        throw new Error(errorData.error + (errorData.details ? ` - Details: ${errorData.details}` : ""));
      }

      const audioData = await response.arrayBuffer();
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioBuffer = await audioContext.decodeAudioData(audioData);
      
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start();
      source.onended = () => {
        setIsSpeaking(false);
        audioContext.close(); // Clean up AudioContext
      };

    } catch (error) {
      console.error("TTS error object:", error); // Log the full error object
      const errorMessage = error instanceof Error ? error.message : "Failed to synthesize speech.";
      setTtsError(`Error: ${errorMessage}`);
      setIsSpeaking(false);
    }
  };

  // Auto-translate when sourceText or targetLang changes, if sourceText is not empty.
  // This can be a bit aggressive. Consider debouncing or manual trigger.
  // For now, let's make it explicit with a button.
  // useEffect(() => {
  //   if (sourceText.trim() && !isRecording) { // Only translate if not recording and there is text
  //     handleTranslate(sourceText, selectedTargetLang.split('-')[0]);
  //   }
  // }, [sourceText, selectedTargetLang, isRecording, handleTranslate]);


  return (
    <main className="flex min-h-screen flex-col items-center justify-start p-4 sm:p-8 md:p-12 bg-gradient-to-b from-sky-100 to-sky-50 dark:from-slate-800 dark:to-slate-900 text-gray-900 dark:text-gray-100">
      <div className="w-full max-w-4xl space-y-6">
        <header className="text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-sky-700 dark:text-sky-300">HealthTranslateMini</h1>
          <p className="mt-2 text-lg text-gray-600 dark:text-gray-400">Real-time medical translation</p>
        </header>

        <div className="flex flex-col sm:flex-row justify-around items-center space-y-4 sm:space-y-0 sm:space-x-2 my-6 p-4 bg-white/60 dark:bg-slate-700/60 rounded-lg shadow-md">
          <div className="flex flex-col items-center sm:items-start">
            <label htmlFor="sourceLang" className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">From:</label>
            <select 
              id="sourceLang"
              value={selectedSourceLang}
              onChange={(e) => setSelectedSourceLang(e.target.value)}
              className="p-2 border border-gray-300 rounded-md shadow-sm focus:ring-sky-500 focus:border-sky-500 dark:bg-slate-600 dark:border-slate-500 dark:text-white min-w-[150px]"
              disabled={isRecording}
            >
              {supportedLanguages.map(lang => (
                <option key={lang.code} value={lang.code}>{lang.name}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleSwapLanguages}
            className="p-2 rounded-full hover:bg-sky-100 dark:hover:bg-slate-600 text-sky-600 dark:text-sky-300 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-sky-500"
            title="Swap languages"
            disabled={isRecording || isTranslating}
          >
            <ArrowRightLeft size={24} />
          </button>
          
          <div className="flex flex-col items-center sm:items-start">
            <label htmlFor="targetLang" className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">To:</label>
            <select 
              id="targetLang"
              value={selectedTargetLang}
              onChange={(e) => setSelectedTargetLang(e.target.value)}
              className="p-2 border border-gray-300 rounded-md shadow-sm focus:ring-sky-500 focus:border-sky-500 dark:bg-slate-600 dark:border-slate-500 dark:text-white min-w-[150px]"
              disabled={isTranslating || isRecording}
            >
              {supportedLanguages.map(lang => (
                // Prevent selecting same language as source for translation
                // This is a simple check; more sophisticated pairing might be needed for some language pairs
                lang.code !== selectedSourceLang && <option key={lang.code} value={lang.code}>{lang.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center my-6 space-y-3">
          <MicButton 
            onSourceTextUpdate={handleSourceTextUpdate} 
            onRecordingStateChange={handleRecordingStateChange}
            currentSourceLang={selectedSourceLang}
            onFinalTranscript={handleFinalSourceText}
            disabled={isTranslating || isSpeaking} // Disable mic if translating or speaking
          />
          {isRecording && <p className='text-sm text-sky-600 dark:text-sky-400 animate-pulse'>Listening...</p>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <TranscriptPane title={`Source (${supportedLanguages.find(l => l.code === selectedSourceLang)?.name || ''})`} text={sourceText} />
          <TranscriptPane 
            title={`Target (${supportedLanguages.find(l => l.code === selectedTargetLang)?.name || ''})`} 
            text={translatedText} 
            error={translationError || ttsError} // Show TTS error as well
            isLoading={isTranslating}
            onSpeak={handleSpeak} // Pass speak handler
            isSpeaking={isSpeaking} // Pass speaking state
          />
        </div>

        <div className="flex justify-center mt-8 mb-4">
          <button 
            onClick={handleTranslate}
            disabled={isTranslating || isRecording || !sourceText.trim() || isSpeaking}
            className="px-8 py-4 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white font-semibold rounded-lg shadow-md transition-colors duration-150 flex items-center space-x-2 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-opacity-50 text-lg"
          >
            <Languages size={22} />
            <span>{isTranslating ? 'Translating...' : 'Translate'}</span>
          </button>
        </div>

        <footer className="text-center mt-10 text-sm text-gray-500 dark:text-gray-400">
          <p>&copy; {new Date().getFullYear()} HealthTranslateMini. For demonstration purposes.</p>
        </footer>
      </div>
    </main>
  );
}
