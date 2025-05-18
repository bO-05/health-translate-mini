"use client";

import { Mic } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

interface MicButtonProps {
  onSourceTextUpdate: (text: string) => void;
  onRecordingStateChange: (isRecording: boolean) => void;
  currentSourceLang: string;
  onFinalTranscript: (text: string) => void;
  disabled?: boolean;
}

// Extend window type to include SpeechRecognition related events for TS
declare global {
  interface Window {
    SpeechRecognition: any; // Constructor
    webkitSpeechRecognition: any; // Constructor for Safari/older Chrome
  }
  interface SpeechRecognitionEvent extends Event {
    resultIndex: number;
    results: SpeechRecognitionResultList;
  }
  interface SpeechRecognitionErrorEvent extends Event {
    error: string;
    message: string;
  }
}

export default function MicButton({ 
  onSourceTextUpdate, 
  onRecordingStateChange,
  currentSourceLang,
  onFinalTranscript,
  disabled
}: MicButtonProps) {
  const [isActuallyRecording, setIsActuallyRecording] = useState(false);
  const [isPermissionGranted, setIsPermissionGranted] = useState(false);
  const [isSpeechApiSupported, setIsSpeechApiSupported] = useState(true); // Assume supported initially
  const recognitionRef = useRef<any | null>(null);
  const SpeechRecognitionRef = useRef<any | null>(null); // To store the constructor

  useEffect(() => {
    // Check for SpeechRecognition API support on client side
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      console.warn("Speech Recognition API is not supported in this browser.");
      setIsSpeechApiSupported(false);
      return;
    }
    SpeechRecognitionRef.current = SR;
    setIsSpeechApiSupported(true);

    // Check for navigator.permissions and then query, or assume not granted if API not present
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'microphone' as PermissionName }).then((permissionStatus) => {
        setIsPermissionGranted(permissionStatus.state === 'granted');
        permissionStatus.onchange = () => {
          setIsPermissionGranted(permissionStatus.state === 'granted');
        };
      }).catch(err => {
        console.warn("Could not query microphone permission state:", err);
        // Fallback: assume not granted if query fails, user will be prompted by getUserMedia
        setIsPermissionGranted(false); 
      });
    } else {
      console.warn("navigator.permissions API not supported, microphone access will be requested on first use.");
      // Fallback: assume not granted, user will be prompted by getUserMedia later
      setIsPermissionGranted(false); 
    }

    const newRecognitionInstance = new SpeechRecognitionRef.current();
    newRecognitionInstance.continuous = true;
    newRecognitionInstance.interimResults = true;
    
    newRecognitionInstance.onresult = (event: SpeechRecognitionEvent) => {
      let currentInterimTranscript = '';
      let completeFinalTranscript = '';
      let newFinalSegmentThisEvent = false;

      // Build the complete final transcript from all results so far
      // and determine if a new segment was finalized in this event.
      for (let i = 0; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          completeFinalTranscript += event.results[i][0].transcript;
          if (i >= event.resultIndex) { // Check if this finalization is part of the current event results
            newFinalSegmentThisEvent = true;
          }
        }
      }
      
      // Get the current interim transcript from the latest, non-final parts of this event.
      for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (!event.results[i].isFinal) {
              currentInterimTranscript += event.results[i][0].transcript;
          }
      }

      onSourceTextUpdate(completeFinalTranscript + currentInterimTranscript);
      
      // If a new segment was finalized in this event and there's meaningful final text,
      // call onFinalTranscript with the *entire accumulated* final transcript.
      if (newFinalSegmentThisEvent && completeFinalTranscript.trim() !== "") {
        onFinalTranscript(completeFinalTranscript.trim());
      }
    };

    newRecognitionInstance.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error', event.error, event.message);
      if (event.error === 'not-allowed' || event.error === 'permission-denied') {
        setIsPermissionGranted(false);
      }
      // Always set recording states to false on error
      setIsActuallyRecording(false);
      onRecordingStateChange(false);
    };

    newRecognitionInstance.onend = () => {
      // Revised logic: Always update state on 'end' to ensure cleanup.
      // The SpeechRecognition service can end for various reasons (e.g. silence, network, or stop() called).
      // We rely on handleToggleRecording to manage the intended start/stop state.
      // This ensures the UI reflects that recognition is no longer active.
      setIsActuallyRecording(false);
      onRecordingStateChange(false);
      console.log("Speech recognition service ended (onend event).");
    };
    recognitionRef.current = newRecognitionInstance;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  useEffect(() => {
    if (recognitionRef.current) {
      recognitionRef.current.lang = currentSourceLang;
    }
  }, [currentSourceLang]);

  const requestMicrophonePermission = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setIsPermissionGranted(true);
    } catch (error) {
      console.error("Microphone permission denied", error);
      setIsPermissionGranted(false);
    }
  };

  const handleToggleRecording = () => {
    if (!SpeechRecognitionRef.current) return; // API not supported or not yet initialized
    if (!isPermissionGranted) {
      requestMicrophonePermission();
      return;
    }

    if (recognitionRef.current) {
      if (isActuallyRecording) {
        recognitionRef.current.stop();
        setIsActuallyRecording(false);
        onRecordingStateChange(false);
        console.log("Stopped recording via button.");
      } else {
        try {
          recognitionRef.current.lang = currentSourceLang;
          recognitionRef.current.start();
          setIsActuallyRecording(true);
          onRecordingStateChange(true);
          console.log("Started recording...");
        } catch (error) {
          console.error("Error starting speech recognition:", error);
          setIsActuallyRecording(false);
          onRecordingStateChange(false);
        }
      }
    }
  };

  if (!isSpeechApiSupported) {
    return <p className="text-red-500 text-center my-4">Speech recognition is not supported by your browser.</p>;
  }

  return (
    <button
      onClick={handleToggleRecording}
      className={`p-4 rounded-full transition-all duration-200 ease-in-out focus:outline-none focus:ring-4 focus:ring-opacity-50 
        ${!isPermissionGranted 
          ? 'bg-yellow-500 hover:bg-yellow-600 text-white focus:ring-yellow-400'
          : isActuallyRecording 
            ? 'bg-red-500 hover:bg-red-600 text-white focus:ring-red-400 animate-pulse'
            : 'bg-sky-500 hover:bg-sky-600 text-white focus:ring-sky-400'
        }
      `}
      aria-label={!isPermissionGranted ? "Grant microphone permission" : isActuallyRecording ? "Stop recording" : "Start recording"}
      title={!isPermissionGranted ? "Grant microphone permission" : isActuallyRecording ? "Stop recording" : "Start recording"}
      disabled={!isSpeechApiSupported || disabled}
    >
      <Mic size={32} />
    </button>
  );
}
