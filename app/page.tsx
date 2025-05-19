"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import MicButton from "@/components/MicButton";
import TranscriptPane from "@/components/TranscriptPane";
import { ArrowRightLeft, Languages, Volume2, Settings2, Info, MessageSquarePlus, LogIn, Users, Copy, Check, XCircle, Trash2, Send, Loader2 } from 'lucide-react'; // Added Send and Loader2
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
  const [ttsLoadingMessageId, setTtsLoadingMessageId] = useState<string | null>(null); // For chat message TTS loading
  const abortControllerRef = useRef<AbortController | null>(null); // For cancelling fetch
  const audioRef = useRef<HTMLAudioElement | null>(null); // Ref to hold the Audio element
  const isTranslatingRef = useRef(isTranslating);

  // Language settings specifically for the chat room
  const [chatSourceLang, setChatSourceLang] = useState(selectedSourceLang);
  const [chatTargetLang, setChatTargetLang] = useState(selectedTargetLang);

  // New state for chat rooms
  const [chatState, setChatState] = useState<'idle' | 'creating_room' | 'joining_room' | 'in_room'>('idle');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [roomError, setRoomError] = useState<string | null>(null);

  // New state for chat messages
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentMessageInput, setCurrentMessageInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null); // For auto-scrolling
  const eventSourceRef = useRef<EventSource | null>(null); // For SSE connection

  // Refs and state for chat STT
  const chatSttBaseTextRef = useRef(""); 
  const lastInterimTranscriptRef = useRef(""); // To help manage replacing the last interim part

  // Type for chat messages
  interface ChatMessage {
    id: string;
    text: string; 
    senderId: string; 
    timestamp: Date;
    originalText?: string; 
    originalLang?: string;
    translatedText?: string; 
    translatedLang?: string;
    isOwn: boolean; // True if sent by the current user
    error?: string; // To indicate send failure
  }

  useEffect(() => {
    // Generate a unique userId for the session if it doesn't exist
    if (!userId) {
      setUserId(crypto.randomUUID());
    }
  }, [userId]); // Run once on mount or if userId somehow gets cleared

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

  // --- Room Management Handlers ---
  const handleCreateRoom = async () => {
    if (!userId) {
      setRoomError("User ID not available. Please refresh.");
      return;
    }
    setChatState('creating_room');
    setRoomError(null);
    try {
      const response = await fetch('/api/room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientUserId: userId }) // Include userId if backend needs it
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Failed to create room." }));
        throw new Error(errorData.message || `HTTP error ${response.status}`);
      }
      const data = await response.json();
      setRoomId(data.id);
      setRoomCode(data.room_code);
      setChatState('in_room');
    } catch (error) {
      console.error("Error creating room:", error);
      setRoomError(error instanceof Error ? error.message : "Unknown error creating room.");
      setChatState('idle');
    }
  };

  const handleJoinRoom = async () => {
    if (!userId) {
      setRoomError("User ID not available. Please refresh.");
      return;
    }
    if (!roomCodeInput.trim()) {
      setRoomError("Please enter a room code.");
      return;
    }
    setChatState('joining_room');
    setRoomError(null);
    try {
      const response = await fetch(`/api/room?room_code=${roomCodeInput.trim().toUpperCase()}`);
      if (!response.ok) {
         const errorData = await response.json().catch(() => ({ message: "Failed to join room. Invalid code or server error." }));
        throw new Error(errorData.message || `Room not found or HTTP error ${response.status}`);
      }
      const data = await response.json();
      setRoomId(data.id);
      setRoomCode(roomCodeInput.trim().toUpperCase()); // Display the code they entered, consistently uppercase
      setChatState('in_room');
      setRoomCodeInput(""); // Clear input
      setMessages([]); // Clear previous messages when joining a new room
    } catch (error) {
      console.error("Error joining room:", error);
      setRoomError(error instanceof Error ? error.message : "Unknown error joining room.");
      setChatState('idle');
    }
  };
  
  // --- End Room Management Handlers ---

  const getLanguageName = (code: string) => {
    const lang = supportedLanguages.find(l => l.code === code);
    return lang ? lang.name : "Unknown Language";
  };

  // Effect to update chat language settings when global settings change *and user is not in a room*
  // This ensures that if a user sets languages on the main page and then creates/joins a room,
  // those preferences are carried into the room initially.
  useEffect(() => {
    if (chatState === 'idle') {
      setChatSourceLang(selectedSourceLang);
      setChatTargetLang(selectedTargetLang);
    }
  }, [selectedSourceLang, selectedTargetLang, chatState]);

  // --- Chat Message Handler ---
  const handleSendMessage = async () => {
    if (!currentMessageInput.trim() || !roomId || !userId) return;

    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      text: currentMessageInput.trim(),
      senderId: userId, 
      timestamp: new Date(),
      isOwn: true,
    };
    setMessages(prevMessages => [...prevMessages, newMessage]);
    const messageToSend = currentMessageInput.trim();
    setCurrentMessageInput(""); // Clear input immediately for better UX
    
    // API call to send message
    try {
      const sourceLangCode = chatSourceLang.split('-')[0]; // Use chat-specific source lang
      const response = await fetch('/api/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: roomId,
          userId: userId,
          text: messageToSend, // Use the stored message
          lang: sourceLangCode,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Failed to send message." }));
        console.error("Error sending message:", errorData.message);
        // Mark the message as failed to send in UI
        setMessages(prev => prev.map(msg => 
          msg.id === newMessage.id ? { ...msg, error: "Failed to send" } : msg
        ));
      }
      // Message successfully sent to server, SSE will handle receiving it for all clients
    } catch (error) {
      console.error("Network error sending message:", error);
      setMessages(prev => prev.map(msg => 
        msg.id === newMessage.id ? { ...msg, error: "Failed to send (network)" } : msg
      ));
    }
  };

  useEffect(() => {
    // Auto-scroll to the latest message
    if (chatState === 'in_room') { // Only scroll when in room and messages update
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, chatState]);

  // --- SSE Connection Management ---
  useEffect(() => {
    if (chatState === 'in_room' && roomId && userId && chatTargetLang) { // Use chatTargetLang
      const targetLangCode = chatTargetLang.split('-')[0]; // Use chat-specific target lang for SSE subscription
      const url = `/api/subscribe-messages?roomId=${roomId}&myUserId=${userId}&myLang=${targetLangCode}`;
      console.log(`[SSE] Connecting to: ${url}`);
      
      eventSourceRef.current = new EventSource(url);

      eventSourceRef.current.onopen = () => {
        console.log("[SSE] Connection opened.");
        setRoomError(null); // Clear any previous room errors on successful connection
      };

      eventSourceRef.current.onmessage = (event) => {
        try {
          // console.log("[SSE] Raw message data:", event.data);
          const eventData = JSON.parse(event.data);
          
          // Check for keep-alive ping (backend might send a simple object like { type: "ping" } or just a comment line)
          // The standard EventSource API should ignore comment lines (starting with ':') automatically.
          // If backend sends JSON for pings, e.g. { type: 'ping' }, handle it here.
          if (eventData.type === 'ping') {
            // console.log("[SSE] Keep-alive ping received.");
            return;
          }

          console.log("[SSE] Message received:", eventData);

          // Validate incoming message structure (adjust as per actual backend payload)
          if (!eventData.id || !eventData.original_text || !eventData.original_lang || !eventData.sender_user_id) {
            console.warn("[SSE] Received malformed message object:", eventData);
            return;
          }

          // Construct ChatMessage from SSE data
          const incomingMessage: ChatMessage = {
            id: eventData.id, // Message ID from backend
            text: eventData.translated_text || eventData.original_text, // Display translated if available, else original
            senderId: eventData.sender_user_id,
            timestamp: new Date(eventData.timestamp || Date.now()), // Use backend timestamp or current time
            isOwn: eventData.sender_user_id === userId,
            originalText: eventData.original_text,
            originalLang: eventData.original_lang,
            translatedText: eventData.translated_text,
            translatedLang: eventData.translated_lang,
          };

          // Add to messages list, ensuring not to add if it's an echo of own message already optimistically added
          // (though backend /api/subscribe-messages should already filter out sender_user_id === myUserId)
          // For robustness, we can double check here if needed, but for now assume backend handles it.
          setMessages((prevMessages) => {
            // Prevent duplicate messages if backend echoes and we also have optimistic updates
            if (prevMessages.some(msg => msg.id === incomingMessage.id && msg.isOwn === incomingMessage.isOwn)) {
              return prevMessages;
            }
            return [...prevMessages, incomingMessage];
          });

        } catch (error) {
          console.error("[SSE] Error parsing message data or processing message:", error, "Raw data:", event.data);
        }
      };

      eventSourceRef.current.onerror = (error) => {
        console.error("[SSE] Connection error:", error);
        // The EventSource API attempts to reconnect automatically on some errors.
        // If it's a fatal error or server explicitly closes, it might stop.
        // We might set a roomError here to inform the user.
        setRoomError("Chat connection error. Attempting to reconnect...");
        // No need to manually close here, EventSource handles retries unless explicitly told otherwise
        // or if the server closes the connection with a non-retryable status.
        // If it was a one-off error and it reconnects, onopen will be called again.
      };

      // Cleanup function: close connection when component unmounts or dependencies change
      return () => {
        if (eventSourceRef.current) {
          console.log("[SSE] Closing connection.");
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
      };
    } else {
      // If not in_room, or missing roomId/userId, ensure any existing connection is closed
      if (eventSourceRef.current) {
        console.log("[SSE] Closing connection due to state change (not in_room or missing IDs).");
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatState, roomId, userId, chatTargetLang]); // IMPORTANT: chatTargetLang is now a dependency

  // --- End SSE Connection Management ---

  // --- Chat STT Integration ---
  const handleChatMicTranscript = useCallback((text: string, isFinal: boolean) => {
    if (isFinal) {
      // For final transcript, concatenate base text with the final text.
      // Ensure a space if base text exists and the final text is not empty.
      const finalText = chatSttBaseTextRef.current + (chatSttBaseTextRef.current && text ? " " : "") + text;
      setCurrentMessageInput(finalText.trim());
      lastInterimTranscriptRef.current = ""; // Clear interim ref
      // console.log(`[ChatSTT] Final: "${finalText.trim()}" (Base: "${chatSttBaseTextRef.current}")`);
      // Optional: Keep chatSttBaseTextRef.current = finalText.trim() if continuous STT is desired after a pause.
      // For now, effectively resets base for next full utterance or typing.
      chatSttBaseTextRef.current = finalText.trim(); 
    } else {
      // For interim transcript, show base text + current interim text.
      // Ensure a space if base text exists and the interim text is not empty.
      const interimText = chatSttBaseTextRef.current + (chatSttBaseTextRef.current && text ? " " : "") + text;
      setCurrentMessageInput(interimText.trimStart()); // trimStart to avoid leading space if base is empty
      lastInterimTranscriptRef.current = text; // Store the current interim part for potential replacement by next interim
      // console.log(`[ChatSTT] Interim: "${interimText.trimStart()}" (Base: "${chatSttBaseTextRef.current}")`);
    }
  }, []); // Dependencies: chatSttBaseTextRef (implicitly via useRef)

  // Handler for when MicButton recording state changes *specifically for chat input*
  const [isChatMicRecording, setIsChatMicRecording] = useState(false);
  const handleChatMicRecordingStateChange = useCallback((recording: boolean) => {
    setIsChatMicRecording(recording);
    if (recording) {
      // When recording starts, capture the current input as the base for STT.
      // This allows STT to append to already typed text.
      chatSttBaseTextRef.current = currentMessageInput.trim();
      lastInterimTranscriptRef.current = ""; // Reset interim ref
      // console.log(`[ChatSTT] Recording started. Base text set to: "${chatSttBaseTextRef.current}"`);
    } else {
      // When recording stops, if there was an interim transcript, it might need to be treated as final
      // if the STT service doesn't send a final event upon manual stop.
      // The current onFinalTranscript from MicButton should handle this.
      // We might also want to commit the last interim as the new base if no final comes.
      if (lastInterimTranscriptRef.current) {
         // console.log(`[ChatSTT] Recording stopped with active interim: "${lastInterimTranscriptRef.current}". Committing as base.`);
        // Commit the current display as the new base, effectively finalizing the last interim.
        chatSttBaseTextRef.current = currentMessageInput.trim();
        lastInterimTranscriptRef.current = "";
      }
    }
  }, [currentMessageInput]); // Add currentMessageInput as dependency

  // --- Room Code Copy to Clipboard ---
  const [copyRoomCodeStatus, setCopyRoomCodeStatus] = useState<'idle' | 'copied' | 'error'>('idle');

  const handleCopyRoomCode = () => {
    if (!roomCode) return;
    navigator.clipboard.writeText(roomCode)
      .then(() => {
        setCopyRoomCodeStatus('copied');
        setTimeout(() => setCopyRoomCodeStatus('idle'), 2000); // Reset after 2 seconds
      })
      .catch(err => {
        console.error("Failed to copy room code: ", err);
        setCopyRoomCodeStatus('error');
        setTimeout(() => setCopyRoomCodeStatus('idle'), 2000);
      });
  };
  // --- End Room Code Copy ---

  // --- TTS for individual chat messages ---
  const handleSpeakChatMessage = async (messageId: string, text: string, langCode?: string) => {
    if (!text.trim()) {
      setTtsError("Nothing to speak for this message.");
      return;
    }
    if (isSpeaking) { // Prevent starting new TTS if already speaking
        console.log("[handleSpeakChatMessage] Already speaking, ignoring request.");
        return;
    }
    setIsSpeaking(true);
    setTtsLoadingMessageId(messageId); // Set loading for this specific message
    setTtsError(null);

    if (audioRef.current && audioRef.current.src) {
      URL.revokeObjectURL(audioRef.current.src);
      audioRef.current = null;
    }

    try {
      const language = langCode || 'en'; // Default to English if langCode is not provided
      console.log(`[handleSpeakChatMessage] Fetching TTS for text: "${text.substring(0,30)}..." lang: ${language}`);
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text, targetLang: language }), // Ensure API expects targetLang for voice selection
      });

      if (!response.ok) {
        let errorData = { error: `TTS API error! status: ${response.status}`, details: "No additional details." };
        try { errorData = await response.json(); } catch (e) { /* ignore */ }
        throw new Error(errorData.error + (errorData.details ? ` - Details: ${errorData.details}` : ""));
      }
      if (!response.body) throw new Error("TTS response body is null");
      
      const audioBlob = await response.blob();
      if (audioBlob.size === 0) throw new Error("Received empty audio blob.");

      const audioUrl = URL.createObjectURL(audioBlob);
      const newAudio = new Audio(audioUrl);
      audioRef.current = newAudio;
      
      newAudio.play().catch(playError => {
        console.error("[handleSpeakChatMessage] Error playing audio:", playError);
        setTtsError(`Error playing audio: ${playError.message}`);
        setIsSpeaking(false);
        setTtsLoadingMessageId(null); // Clear loading ID
        URL.revokeObjectURL(audioUrl);
      });
      newAudio.onended = () => {
        setIsSpeaking(false);
        setTtsLoadingMessageId(null); // Clear loading ID
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
      };
      newAudio.onerror = (e) => {
        let errorMsg = "Audio playback failed.";
        if (newAudio.error) errorMsg += ` Code: ${newAudio.error.code}, Message: ${newAudio.error.message}`;
        setTtsError(errorMsg);
        setIsSpeaking(false);
        setTtsLoadingMessageId(null); // Clear loading ID
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
      };
    } catch (error) {
      console.error("[handleSpeakChatMessage] TTS processing error:", error);
      setTtsError(`Error: ${error instanceof Error ? error.message : "Failed to synthesize speech."}`);
      setIsSpeaking(false);
      setTtsLoadingMessageId(null); // Clear loading ID
    }
  };
  // --- End TTS for individual chat messages ---

  // --- End Chat STT Integration ---

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white p-2 sm:p-4 md:p-6 selection:bg-sky-500 selection:text-white">
      {/* <RetroGrid /> */}

      <header className="mb-6 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-sky-400 to-cyan-300 py-2">
          HealthTranslate Mini
        </h1>
        <p className="text-slate-400 text-sm sm:text-base">Real-time spoken language translation for healthcare.</p>
        </header>

      {chatState === 'idle' && (
        <div className="flex flex-col items-center justify-center space-y-6 my-auto p-6 bg-slate-800/50 rounded-xl shadow-2xl max-w-md mx-auto">
          <h2 className="text-3xl font-semibold text-sky-300">Join or Create a Chat Room</h2>
          <p className="text-slate-400 text-center">Communicate in real-time with translation.</p>
          
          <button
            onClick={handleCreateRoom}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-sky-500 hover:bg-sky-600 text-white font-semibold rounded-lg shadow-md transition-all duration-150 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-opacity-75"
          >
            <MessageSquarePlus size={20} /> Create New Room
          </button>

          <div className="w-full text-center">
            <p className="text-slate-500 my-2">OR</p>
          </div>
          
          <div className="w-full space-y-3">
            <input
              type="text"
              value={roomCodeInput}
              onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
              placeholder="Enter Room Code (e.g., AB12CD)"
              className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:ring-sky-500 focus:border-sky-500 outline-none transition-colors"
              maxLength={6}
            />
            <button
              onClick={handleJoinRoom}
              disabled={!roomCodeInput.trim() || roomCodeInput.trim().length !== 6}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-lg shadow-md transition-all duration-150 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-opacity-75 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <LogIn size={20} /> Join Room
            </button>
          </div>
          {roomError && <p className="text-red-400 text-sm mt-3 text-center">{roomError}</p>}
        </div>
      )}

      {(chatState === 'creating_room' || chatState === 'joining_room') && (
        <div className="flex flex-col items-center justify-center space-y-4 my-auto">
          <Users className="w-16 h-16 animate-spin text-sky-400" />
          <p className="text-xl text-slate-300">
            {chatState === 'creating_room' ? 'Creating your room...' : 'Joining room...'}
          </p>
        </div>
      )}
      
      {chatState === 'in_room' && (
         <div className="flex flex-col h-[calc(100vh-180px)] sm:h-[calc(100vh-160px)] md:h-[calc(100vh-150px)] max-w-2xl mx-auto w-full bg-slate-800/70 backdrop-blur-sm rounded-xl shadow-2xl overflow-hidden border border-slate-700">
          {/* Room Header */}
          <div className="p-3 sm:p-4 border-b border-slate-700 bg-slate-800/50">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-semibold text-emerald-400 whitespace-nowrap">
                    Chat:
                  </h2>
                  <div className="flex items-center gap-1 bg-slate-700/50 px-2 py-1 rounded-md">
                    <span className="text-sky-300 font-mono text-sm sm:text-base">{roomCode}</span>
                    <button 
                      onClick={handleCopyRoomCode}
                      title="Copy Room Code"
                      className="p-1 text-slate-400 hover:text-sky-300 transition-colors relative"
                    >
                      {copyRoomCodeStatus === 'copied' ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                    </button>
                    {copyRoomCodeStatus === 'error' && <XCircle size={16} className="text-red-400 ml-1" />}
                  </div>
                </div>
                <button
                    onClick={() => {
                    setChatState('idle');
                    setRoomId(null);
                    setRoomCode(null);
                    setRoomError(null);
                    setMessages([]); // Clear messages on leaving room
                    // SSE connection is closed by the useEffect cleanup due to chatState change
                    // Reset chat language preferences to global ones when leaving
                    setChatSourceLang(selectedSourceLang);
                    setChatTargetLang(selectedTargetLang);
                    }}
                    className="px-3 py-1.5 text-xs sm:text-sm bg-red-600 hover:bg-red-700 text-white font-semibold rounded-md shadow-md transition-all duration-150 ease-in-out"
                >
                    Leave Room
                </button>
            </div>
            <div className="text-xs text-slate-400 mt-1">
                <span>Room ID: {roomId?.substring(0,8)}...</span> | <span title={userId || undefined}>My ID: {userId?.substring(0,8)}...</span>
            </div>
            
            {/* New In-Chat Language Selectors */}
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs items-center">
              <div className="flex flex-col items-start sm:items-center sm:flex-row sm:gap-1">
                <label htmlFor="chat-source-lang" className="text-slate-300 whitespace-nowrap">My Language:</label>
                <select 
                  id="chat-source-lang"
                  value={chatSourceLang}
                  onChange={(e) => setChatSourceLang(e.target.value)}
                  className="w-full sm:w-auto p-1.5 border rounded-md bg-slate-700 text-white focus:ring-1 focus:ring-sky-500 outline-none text-xs appearance-none pr-6 bg-no-repeat bg-right"
                  style={{backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.5rem center', backgroundSize: '1.2em'}}
                >
                  {supportedLanguages.map((lang) => (
                    <option key={lang.code} value={lang.code} className="text-slate-900 dark:text-white bg-white dark:bg-slate-700">
                      {lang.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col items-start sm:items-center sm:flex-row sm:gap-1">
                <label htmlFor="chat-target-lang" className="text-slate-300 whitespace-nowrap">Translate For Me To:</label>
                <select 
                  id="chat-target-lang"
                  value={chatTargetLang}
                  onChange={(e) => setChatTargetLang(e.target.value)} // This will trigger SSE re-subscription via useEffect
                  className="w-full sm:w-auto p-1.5 border rounded-md bg-slate-700 text-white focus:ring-1 focus:ring-sky-500 outline-none text-xs appearance-none pr-6 bg-no-repeat bg-right"
                  style={{backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.5rem center', backgroundSize: '1.2em'}}
                >
                  {supportedLanguages.map(lang => (
                    <option key={lang.code} value={lang.code} className="text-slate-900 dark:text-white bg-white dark:bg-slate-700">{lang.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-grow p-3 sm:p-4 space-y-3 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 hover:scrollbar-thumb-slate-500 scrollbar-track-slate-700/50">
            {messages.length === 0 && (
              <p className="text-slate-400 text-center py-10 italic">No messages yet. Say hello!</p>
            )}
            {messages.map((msg) => (
              <div key={msg.id} className={`flex flex-col ${msg.isOwn ? 'items-end' : 'items-start'}`}>
                <div className={`flex items-end gap-2 max-w-[80%] sm:max-w-[70%] ${msg.isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className={`p-2.5 rounded-lg shadow ${msg.isOwn ? 'bg-sky-600 text-white rounded-br-none' : 'bg-slate-600 text-slate-100 rounded-bl-none'}`}>
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
                    {msg.error && <p className="text-xs text-red-300 mt-0.5">Error: {msg.error}</p>}
                  </div>
                  {!msg.isOwn && (msg.translatedText || msg.originalText) && (
                    <button 
                      onClick={() => handleSpeakChatMessage(msg.id, msg.translatedText || msg.originalText!, msg.translatedLang || msg.originalLang?.split('-')[0])}
                      disabled={isSpeaking} // Disable if any TTS is active globally
                      className="p-1.5 text-slate-400 hover:text-sky-300 disabled:text-slate-600 transition-colors"
                      title="Speak this message"
                    >
                      {ttsLoadingMessageId === msg.id ? <Loader2 size={16} className="animate-spin" /> : <Volume2 size={16} />}
                    </button>
                  )}
                </div>
                <p className={`text-xs mt-1 px-1 ${msg.isOwn ? 'text-sky-300/70 self-end' : 'text-slate-400/70 self-start'}`}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input Area */}
          <div className="p-3 sm:p-4 border-t border-slate-700 bg-slate-800/50">
            <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="flex items-center gap-2">
              <MicButton
                onTranscriptUpdate={(text) => handleChatMicTranscript(text, false)} // Pass interim results
                onFinalTranscript={(text) => handleChatMicTranscript(text, true)}   // Pass final results
                onRecordingStateChange={handleChatMicRecordingStateChange}      // Manage chat-specific mic recording state
                currentLang={chatSourceLang} // Use the CHAT source language for STT
                isTranslating={isSpeaking} // Disable Mic if TTS is active (renamed from isTranslating for clarity in this context)
              />
              <textarea
                value={currentMessageInput}
                onChange={(e) => setCurrentMessageInput(e.target.value)}
                onKeyDown={(e) => { // Changed from onKeyPress for better Enter key handling
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault(); 
                    handleSendMessage();
                  }
                }}
                placeholder={`Message as ${getLanguageName(chatSourceLang)}... (Shift+Enter for newline)`} // Use chat source lang
                className="flex-grow p-2.5 bg-slate-600/70 border border-slate-500/70 rounded-lg text-white placeholder-slate-400 focus:ring-1 focus:ring-sky-500 focus:border-sky-500 outline-none transition-colors resize-none leading-tight scrollbar-thin scrollbar-thumb-slate-500 scrollbar-track-slate-600"
                rows={1}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = `${Math.min(target.scrollHeight, 120)}px`; // Max height approx 5 lines
                }}
              />
              <button
                type="submit" // Changed to type submit for form handling
                disabled={!currentMessageInput.trim() || !roomId || chatState !== 'in_room'}
                className="p-2.5 bg-sky-500 hover:bg-sky-600 text-white rounded-lg shadow-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center"
                title="Send Message"
              >
                <Send size={20} />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Conditionally render the original translation UI if not in a chat room state or if explicitly chosen */}
      {chatState === 'idle' && !roomId && ( // Show original UI only if truly idle and not after leaving a room (roomID might still be set briefly)
                                          // This condition might need adjustment based on desired flow after leaving a room.
                                          // For now, let's refine to: show if not in a room related state.
        <div className="mt-8"> {/* Added mt-8 to push down the original UI when room UI is not shown */}
          {/* This block should be hidden when chatState is 'in_room', 'creating_room', or 'joining_room' */}
          {/* The following is the original UI for translation, STT, TTS */}
           <div className="flex flex-col md:flex-row gap-4 md:gap-6 mb-6 md:items-center justify-center px-2">
            <div className="flex-1 flex flex-col sm:flex-row gap-2 items-center">
            <select 
              id="source-lang-select"
              value={selectedSourceLang}
              onChange={(e) => setSelectedSourceLang(e.target.value)}
              className="w-full p-2 border rounded-md bg-background dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 outline-none text-slate-900 dark:text-white"
              aria-label="Select source language"
            >
              {supportedLanguages.map((lang) => (
                <option key={lang.code} value={lang.code} className="text-slate-900 dark:text-white bg-white dark:bg-slate-700">
                  {lang.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleSwapLanguages}
              className="p-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors duration-150 flex items-center justify-center"
              title="Swap Languages"
              disabled={isTranslating || isRecording || isSpeaking}
            >
              <ArrowRightLeft size={20} className="text-sky-400" />
          </button>

            <div className="flex-1 flex flex-col sm:flex-row gap-2 items-center">
            <select 
              id="target-lang-select"
              value={selectedTargetLang}
              onChange={(e) => setSelectedTargetLang(e.target.value)}
              className="w-full p-2 border rounded-md bg-background dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-offset-1 focus:ring-green-500 outline-none text-slate-900 dark:text-white"
              aria-label="Select target language"
            >
                {supportedLanguages.map(lang => (
                  <option key={lang.code} value={lang.code} className="text-slate-900 dark:text-white bg-white dark:bg-slate-700">{lang.name}</option>
              ))}
            </select>
          </div>
        </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            <TranscriptPane
              text={sourceText}
              setText={setSourceText} 
              isReadOnly={isTranslating || isSpeaking || chatState !== 'idle'}
              placeholder="Speak or type here..."
              paneType="source"
              isLoading={false}
              error={null}
            />
            <TranscriptPane 
              text={translatedText} 
              isReadOnly={true}
              isLoading={isTranslating}
              error={translationError || ttsError}
              placeholder={isTranslating ? "Translating..." : "Translation will appear here..."}
              paneType="target"
              isSpeaking={isSpeaking} 
            />
          </div>

          <div className="mt-6 flex flex-col sm:flex-row justify-center items-center gap-4 md:gap-6">
            {(() => {
              const micButtonDisabledDuringUniversalOps = isTranslating || isSpeaking;
              return (
                <MicButton
                  onRecordingStateChange={handleRecordingStateChange}
                  onTranscriptUpdate={handleSourceTextUpdate}
                  onFinalTranscript={handleFinalSourceText}
                  currentLang={selectedSourceLang}
                  isTranslating={micButtonDisabledDuringUniversalOps}
                />
              );
            })()}
            <button 
              onClick={handleTranslate}
              disabled={!sourceText.trim() || isRecording || isTranslating || isSpeaking || chatState !== 'idle'}
              className={`px-8 py-4 text-lg font-semibold rounded-xl transition-all duration-200 ease-in-out flex items-center justify-center gap-3
                          ${(!sourceText.trim() || isRecording || isTranslating || isSpeaking || chatState !== 'idle')
                            ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                            : 'bg-gradient-to-br from-sky-500 to-cyan-400 hover:from-sky-600 hover:to-cyan-500 text-white shadow-lg hover:shadow-sky-500/50 transform hover:scale-105'}`}
            >
              <Languages size={24}/> Translate
            </button>
            {/* Speak button for the main translated text pane (non-chat mode) */}
            <button
              onClick={handleSpeak}
              disabled={!translatedText.trim() || isTranslating || isSpeaking || !!translationError || chatState !== 'idle'}
              className={`p-4 text-lg font-semibold rounded-xl transition-all duration-200 ease-in-out flex items-center justify-center gap-3
                          ${(!translatedText.trim() || isTranslating || isSpeaking || !!translationError || chatState !== 'idle')
                            ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                            : 'bg-gradient-to-br from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg hover:shadow-purple-500/50 transform hover:scale-105'}`}
              title="Speak translated text"
            >
              {isSpeaking ? <Loader2 size={24} className="animate-spin" /> : <Volume2 size={24} />}
               <span className="ml-2">{isSpeaking ? 'Speaking...' : 'Speak'}</span>
            </button>
          </div>
        </div>
      )}


      <footer className="mt-auto pt-10 pb-6 text-center text-slate-500 text-xs sm:text-sm">
        <div className="mb-2">
          <p className="inline-flex items-center"><Info size={14} className="mr-1.5 text-sky-400"/> For medical accuracy, always consult a qualified professional.</p>
          <p>This tool is for general assistance only.</p>
        </div>
        <p>&copy; {new Date().getFullYear()} HealthTranslate Mini. AI-Assisted. Version {process.env.NEXT_PUBLIC_APP_VERSION || "1.1.0"}</p>
        </footer>
      </div>
  );
}
