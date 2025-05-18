"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import MicButton from "@/components/MicButton";
import TranscriptPane from "@/components/TranscriptPane";
import { ArrowRightLeft, Languages, Volume2, Settings2, Info } from 'lucide-react';
// import RetroGrid from "@/components/magicui/retro-grid";
// import ShinyButton from "@/components/magicui/shiny-button";
// import { cn } from "@/lib/utils";

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
  const abortControllerRef = useRef<AbortController | null>(null); // For cancelling fetch
  const audioRef = useRef<HTMLAudioElement | null>(null); // Ref to hold the Audio element
  const isTranslatingRef = useRef(isTranslating);

  useEffect(() => {
    isTranslatingRef.current = isTranslating;
  }, [isTranslating]);

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

    // Cancel any ongoing translation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setIsTranslating(true);
    setTranslationError(null);
    setTranslatedText("Initiating translation stream..."); // Initial status

    try {
      const targetLangCode = selectedTargetLang.split('-')[0];
      const sourceLangCode = selectedSourceLang.split('-')[0];
      
      const response = await fetch('/api/translate-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sourceText, targetLang: targetLangCode, sourceLang: sourceLangCode }),
        signal: signal,
      });

      if (signal.aborted) {
        console.log("Translation stream fetch aborted by client.");
        setTranslatedText("Translation cancelled by user.");
        setIsTranslating(false); // Reset translating state
        return;
      }

      if (!response.ok) {
        // Handle non-OK responses before trying to read as a stream
        const errorData = await response.json().catch(() => ({ error: "Failed to get error details from stream initiation." }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error("Response body is null");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (signal.aborted) { // Check for abort early in the loop
            console.log("[handleTranslate] Abort signal detected before reader.read() completed or after done.");
            setTranslatedText("Translation cancelled by user.");
            setIsTranslating(false);
            if (reader && typeof reader.cancel === 'function') {
                await reader.cancel();
            }
            return;
        }

        if (done) {
          console.log("[handleTranslate] Stream reader done.");
          // If isTranslating is still true here, it implies the stream ended without a proper 'end' or 'error' event fully processed.
          if (isTranslatingRef.current) {
            console.warn("[handleTranslate] Stream ended but still in translating state. Setting to not translating. Final buffer:", buffer);
            // Consider setting an error or a specific message if the buffer is not empty and indicates an issue.
            // For now, just ensure translating state is reset.
            setIsTranslating(false);
            // If buffer has partial error message, you might want to display it.
            if (buffer.includes('error')) {
                setTranslationError("Stream ended abruptly with potential error data.");
            }
          }
          break; 
        }

        const chunk = decoder.decode(value, { stream: true });
        // console.log("[handleTranslate] Received stream chunk:", chunk); // Commented out to reduce noise/privacy
        buffer += chunk;
        
        let eolIndex;
        while ((eolIndex = buffer.indexOf('\n\n')) >= 0) {
          const singleMessageBlock = buffer.substring(0, eolIndex);
          buffer = buffer.substring(eolIndex + 2);

          if (signal.aborted) {
            console.log("[handleTranslate] Abort signal detected mid-processing message block.");
            setTranslatedText("Translation cancelled by user.");
            setIsTranslating(false);
            if (reader && typeof reader.cancel === 'function') { await reader.cancel(); }
            return; 
          }

          let event = '';
          let eventDataString = '';

          // console.log("[handleTranslate] Processing message block:", singleMessageBlock); // Optional: comment out if too noisy
          singleMessageBlock.split('\n').forEach(line => {
            // console.log(`[handleTranslate] Line: '${line}'`); // Optional: comment out if too noisy
            if (line.startsWith('event: ')) {
              event = line.substring('event: '.length).trim();
            } else if (line.startsWith('data: ')) {
              const dataLine = line.substring('data: '.length);
              if (eventDataString === '') {
                eventDataString = dataLine;
              } else {
                eventDataString += '\n' + dataLine;
              }
            }
          });
          
          // console.log(`[handleTranslate] Extracted Event: '${event}', Extracted DataString: '${eventDataString}'`); // Optional: comment out

          if (eventDataString) {
            try {
              const eventData = JSON.parse(eventDataString);
              console.log("[handleTranslate] SSE Event:", event, "Data:", eventData); // Keep this one for key events

              if (event === 'status') {
                // Only update for intermediate statuses, not for "Translation complete."
                if (eventData.message && eventData.message !== "Translation complete.") {
                    setTranslatedText(eventData.message);
                } else if (eventData.message === "Translation complete.") {
                    console.log("[handleTranslate] Received 'Translation complete' status, not updating text pane, waiting for 'end'.")
                }
              } else if (event === 'full_translation') {
                setTranslatedText(eventData.translatedText || "Error: Empty translation received.");
              } else if (event === 'error') {
                console.error("[handleTranslate] Received 'error' event from stream:", eventData);
                setTranslationError(eventData.message + (eventData.details ? `: ${eventData.details}` : ''));
                setTranslatedText("Translation failed.");
                setIsTranslating(false);
                if (reader && typeof reader.cancel === 'function') { await reader.cancel(); }
                return; 
              } else if (event === 'end') {
                console.log("[handleTranslate] Received 'end' event from stream. Setting isTranslating to false.");
                // If a previous status was "Translation complete.", translatedText might be that status.
                // Ensure full_translation has set the text, or it might be empty if error before full_translation.
                // The important part here is to stop the loading state.
                setIsTranslating(false);
                if (reader && typeof reader.cancel === 'function') { await reader.cancel(); }
                return; 
              }
            } catch (e) {
              console.error("[handleTranslate] JSON.parse failed for eventDataString:", eventDataString, "Error:", e);
              setTranslationError("Error parsing translation data stream.");
              setTranslatedText("Translation data corrupted.");
              setIsTranslating(false);
              if (reader && typeof reader.cancel === 'function') { await reader.cancel(); }
              return;
            }
          } else {
            // console.log("[handleTranslate] eventDataString was empty after parsing message block. Event:", event); // Optional: comment out
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        console.log('Fetch aborted by user action (outside stream loop).');
        setTranslatedText("Translation cancelled.");
      } else {
        console.error("Translation error (outside stream loop):", error);
        const errorMessage = error instanceof Error ? error.message : "Failed to translate.";
        setTranslationError(`Error: ${errorMessage}`);
        setTranslatedText("Translation failed.");
      }
    } finally {
      // Ensure setIsTranslating is false if not already set by 'end' or 'error' event
      // This is a fallback.
      if (isTranslatingRef.current) {
        setIsTranslating(false);
      }
      if (abortControllerRef.current && signal === abortControllerRef.current.signal) {
        abortControllerRef.current = null;
      }
    }
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

  // Cleanup function for audio object URL
  useEffect(() => {
    return () => {
      if (audioRef.current && audioRef.current.src) {
        URL.revokeObjectURL(audioRef.current.src);
        // console.log("[handleSpeak] Revoked Object URL:", audioRef.current.src);
      }
    };
  }, []);

  const handleSpeak = async () => {
    if (!translatedText.trim() || translationError) {
      setTtsError("Nothing to speak or translation failed.");
      return;
    }
    setIsSpeaking(true);
    setTtsError(null);

    // Clean up previous audio element and URL if any
    if (audioRef.current && audioRef.current.src) {
      URL.revokeObjectURL(audioRef.current.src);
      audioRef.current = null;
    }

    try {
      const targetLangCode = selectedTargetLang.split('-')[0];
      console.log("[handleSpeak] Fetching TTS audio for language:", targetLangCode);
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: translatedText, targetLang: targetLangCode }),
      });

      console.log("[handleSpeak] TTS API response status:", response.status);
      if (!response.ok) {
        let errorData = { error: `TTS API error! status: ${response.status}`, details: "No additional details from API." };
        try {
          errorData = await response.json(); // Try to parse error if server sends JSON
        } catch (e) {
          const textError = await response.text(); // Fallback to text if not JSON
          console.warn("[handleSpeak] Could not parse JSON from TTS error response. Text error:", textError);
          errorData.details = textError || "Failed to get error details.";
        }
        throw new Error(errorData.error + (errorData.details ? ` - Details: ${errorData.details}` : ""));
      }

      if (!response.body) {
        throw new Error("TTS response body is null");
      }
      
      console.log("[handleSpeak] Receiving audio blob...");
      const audioBlob = await response.blob();
      console.log("[handleSpeak] Audio blob received, type:", audioBlob.type, "size:", audioBlob.size);

      if (audioBlob.size === 0) {
        throw new Error("Received empty audio blob from TTS API.");
      }

      const audioUrl = URL.createObjectURL(audioBlob);
      console.log("[handleSpeak] Created Object URL:", audioUrl);
      
      const newAudio = new Audio(audioUrl);
      audioRef.current = newAudio; // Store for potential cleanup
      
      newAudio.onloadedmetadata = () => {
        console.log("[handleSpeak] Audio metadata loaded. Duration:", newAudio.duration);
      };
      newAudio.oncanplaythrough = () => {
        console.log("[handleSpeak] Audio can play through. Playing...");
        newAudio.play().catch(playError => {
            console.error("[handleSpeak] Error playing audio:", playError);
            setTtsError(`Error playing audio: ${playError.message}`);
            setIsSpeaking(false);
            URL.revokeObjectURL(audioUrl); // Clean up on play error
        });
      };
      newAudio.onended = () => {
        console.log("[handleSpeak] Audio playback ended.");
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl); // Clean up after playing
        audioRef.current = null;
      };
      newAudio.onerror = (e) => {
        console.error("[handleSpeak] Audio element error:", e);
        // Extract more detailed error from the event if possible
        let errorMsg = "Audio playback failed.";
        if (newAudio.error) {
            errorMsg += ` Code: ${newAudio.error.code}, Message: ${newAudio.error.message}`;
        }
        setTtsError(errorMsg);
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl); // Clean up on error
        audioRef.current = null;
      };

    } catch (error) {
      console.error("[handleSpeak] TTS processing error:", error);
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
    <main className="relative flex flex-col items-center justify-center min-h-screen w-full bg-background dark:bg-slate-900 text-foreground dark:text-slate-100 p-4 md:p-8 selection:bg-blue-500/30">
      {/* <RetroGrid className="absolute inset-0 z-0" /> */}
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-transparent via-background/50 to-background dark:from-transparent dark:via-slate-900/50 dark:to-slate-900" />
      
      <header className="relative z-10 w-full max-w-5xl mb-6 text-center">
        <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-transparent bg-clip-text pb-2">
          HealthTranslate AI
        </h1>
        <p className="text-lg text-muted-foreground dark:text-slate-400">
          Bridging communication gaps in healthcare, instantly.
        </p>
        </header>

      <div className="relative z-10 w-full max-w-5xl p-4 md:p-6 bg-card dark:bg-slate-800/80 backdrop-blur-sm shadow-2xl rounded-xl border border-border dark:border-slate-700">
        <div className="flex flex-col sm:flex-row items-center justify-between mb-4 md:mb-6 gap-2 sm:gap-4">
          <div className="flex-1 w-full sm:w-auto">
            <label htmlFor="source-lang-select" className="sr-only">Source Language</label>
            <select 
              id="source-lang-select"
              value={selectedSourceLang}
              onChange={(e) => setSelectedSourceLang(e.target.value)}
              className="w-full p-2 border rounded-md bg-background dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 outline-none"
              aria-label="Select source language"
            >
              {supportedLanguages.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleSwapLanguages}
            className="p-2 rounded-full hover:bg-muted dark:hover:bg-slate-700 focus:bg-muted dark:focus:bg-slate-600 focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 transition-colors"
            aria-label="Swap source and target languages"
            title="Swap source and target languages"
          >
            <ArrowRightLeft className="w-5 h-5 text-primary" />
          </button>

          <div className="flex-1 w-full sm:w-auto">
            <label htmlFor="target-lang-select" className="sr-only">Target Language</label>
            <select 
              id="target-lang-select"
              value={selectedTargetLang}
              onChange={(e) => setSelectedTargetLang(e.target.value)}
              className="w-full p-2 border rounded-md bg-background dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-offset-1 focus:ring-green-500 outline-none"
              aria-label="Select target language"
            >
              {supportedLanguages.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 items-start">
          {/* Source Language Pane */}
          <div className="flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold flex items-center">
                <Languages className="w-6 h-6 mr-2 text-blue-500" /> Source
              </h2>
            </div>
            <TranscriptPane
              text={sourceText}
              setText={setSourceText} 
              isLoading={isRecording} 
              error={null} 
              isReadOnly={isRecording}
              placeholder="Speak or type here..."
              paneType="source"
            />
            <div className="flex items-center justify-center space-x-3">
                <MicButton 
                    onTranscriptUpdate={handleSourceTextUpdate} 
                    onFinalTranscript={handleFinalSourceText} 
                    onRecordingStateChange={handleRecordingStateChange}
                    currentLang={selectedSourceLang}
                    isTranslating={isTranslatingRef.current} 
                />
            </div>
          </div>

          {/* Target Language Pane */}
          <div className="flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold flex items-center">
                <Volume2 className="w-6 h-6 mr-2 text-green-500" /> Translated
              </h2>
            </div>
            <TranscriptPane 
              text={translatedText} 
              isLoading={isTranslating}
              error={translationError || ttsError}
              isReadOnly={true} 
              placeholder={isTranslating ? "Translating..." : "Translation will appear here..."}
              paneType="target"
              isSpeaking={isSpeaking} 
            />
            <div className="flex items-center justify-between space-x-2">
              <button 
                onClick={handleTranslate}
                disabled={isTranslating || isRecording || !sourceText.trim()}
                className="w-1/2 p-2 rounded-md bg-blue-500 hover:bg-blue-600 text-white disabled:bg-gray-400 dark:disabled:bg-gray-500 focus:ring-2 focus:ring-offset-1 focus:ring-blue-400"
              >
                {isTranslating ? "Translating..." : "Translate"}
              </button>
              <button 
                onClick={handleSpeak}
                disabled={isSpeaking || isTranslating || !translatedText.trim() || !!translationError || !!ttsError}
                className="w-1/2 p-2 rounded-md border border-green-500 text-green-500 hover:bg-green-500 hover:text-white disabled:border-gray-400 disabled:text-gray-400 dark:disabled:border-gray-500 dark:disabled:text-gray-500 disabled:hover:bg-transparent disabled:hover:text-gray-400 focus:ring-2 focus:ring-offset-1 focus:ring-green-400"
              >
                {isSpeaking ? "Speaking..." : "Speak"}
              </button>
            </div>
          </div>
        </div>

        <footer className="mt-8 pt-4 border-t border-border dark:border-slate-700 text-center">
            <p className="text-sm text-muted-foreground dark:text-slate-300">
                <Info size={14} className="inline mr-1" /> 
                For informational purposes only. Not a substitute for professional medical advice.
            </p>
            <p className="text-xs text-muted-foreground dark:text-slate-400 mt-1">
                HealthTranslate AI &copy; {new Date().getFullYear()}
            </p>
        </footer>

      </div>
      {/* Audio element, hidden but used for playback */}
      {/* <audio ref={audioRef} className="hidden" /> */}
      {/* The audioRef logic should be within handleSpeak as it is now */}
    </main>
  );
}
