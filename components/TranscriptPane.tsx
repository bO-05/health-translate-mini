"use client";

import { ClipboardCopy, Volume2 } from 'lucide-react';

interface TranscriptPaneProps {
  title: string;
  text: string;
  error?: string | null;
  isLoading?: boolean;
  onSpeak?: () => void;
  isSpeaking?: boolean;
}

export default function TranscriptPane({ title, text, error, isLoading, onSpeak, isSpeaking }: TranscriptPaneProps) {
  const handleCopy = () => {
    navigator.clipboard.writeText(text)
      .then(() => {
        // TODO: Show a temporary "Copied!" message
        console.log("Text copied to clipboard");
      })
      .catch(err => {
        console.error("Failed to copy text: ", err);
      });
  };

  return (
    <div className="bg-white dark:bg-slate-700 shadow-lg rounded-xl p-6 h-80 flex flex-col">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-200">{title}</h2>
        <div className="flex items-center space-x-2">
          {onSpeak && text && !error && !isLoading && (
            <button
              onClick={onSpeak}
              className="p-2 text-gray-500 hover:text-sky-600 dark:text-gray-400 dark:hover:text-sky-400 transition-colors disabled:opacity-50"
              aria-label={isSpeaking ? "Speaking..." : "Speak text"}
              title={isSpeaking ? "Speaking..." : "Speak text"}
              disabled={isSpeaking || !text.trim()}
            >
              <Volume2 size={20} className={isSpeaking ? 'animate-pulse text-green-500' : ''} />
            </button>
          )}
          <button 
            onClick={handleCopy}
            className="p-2 text-gray-500 hover:text-sky-600 dark:text-gray-400 dark:hover:text-sky-400 transition-colors"
            aria-label="Copy transcript"
            title="Copy transcript"
            disabled={!text || text.endsWith("...")}
          >
            <ClipboardCopy size={20} />
          </button>
        </div>
      </div>
      <div className="flex-grow overflow-y-auto p-3 bg-gray-50 dark:bg-slate-600 rounded-md scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-slate-500 scrollbar-track-transparent">
        {isLoading ? (
          <p className="text-gray-500 dark:text-gray-400 italic">Loading...</p>
        ) : error ? (
          <p className="text-red-500 dark:text-red-400">{error}</p>
        ) : (
          <p className="text-gray-800 dark:text-gray-100 whitespace-pre-wrap break-words">
            {text}
          </p>
        )}
      </div>
      {/* TODO: Add Speak button here for translated text */}
    </div>
  );
} 