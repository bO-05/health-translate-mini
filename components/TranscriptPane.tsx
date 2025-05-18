"use client";

import { ClipboardCopy } from 'lucide-react';
import { useState, useEffect, ChangeEvent } from 'react';

export interface TranscriptPaneProps {
  text: string;
  setText?: (text: string) => void;
  error?: string | null;
  isLoading?: boolean;
  isSpeaking?: boolean;
  isReadOnly?: boolean;
  placeholder?: string;
  paneType: 'source' | 'target';
}

export default function TranscriptPane({ 
  text, 
  setText, 
  error, 
  isLoading, 
  isSpeaking, 
  isReadOnly,
  placeholder,
  paneType 
}: TranscriptPaneProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [copyMessage, setCopyMessage] = useState('');

  const handleCopy = () => {
    if (!text) {
      setCopyStatus('error');
      setCopyMessage('Nothing to copy.');
      setTimeout(() => setCopyStatus('idle'), 2000);
      return;
    }
    navigator.clipboard.writeText(text)
      .then(() => {
        setCopyStatus('success');
        setCopyMessage('Copied!');
        setTimeout(() => setCopyStatus('idle'), 2000);
      })
      .catch(err => {
        console.error("Failed to copy text: ", err);
        setCopyStatus('error');
        setCopyMessage('Failed to copy.');
        setTimeout(() => setCopyStatus('idle'), 2000);
      });
  };

  const handleTextChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    if (setText && !isReadOnly) {
      setText(event.target.value);
    }
  };

  const isEmpty = !text || text.trim() === '';
  const displayPlaceholder = isEmpty && placeholder && !isLoading && !error;

  return (
    <div className={`bg-white dark:bg-slate-700 shadow-lg rounded-xl p-4 h-72 md:h-80 flex flex-col ${paneType === 'source' ? 'border-blue-500/50' : 'border-green-500/50'} border`}>
      <div className="flex justify-end items-center mb-2">
        <div className="flex items-center space-x-2">
          <button 
            onClick={handleCopy}
            className="p-2 text-gray-500 hover:text-sky-600 dark:text-gray-400 dark:hover:text-sky-400 transition-colors"
            aria-label="Copy text"
            title="Copy text"
            disabled={isEmpty || isLoading || !!error}
          >
            <ClipboardCopy size={20} />
          </button>
        </div>
        {copyStatus !== 'idle' && (
          <div className={`absolute top-2 right-2 p-2 rounded-md text-sm
            ${copyStatus === 'success' ? 'bg-green-100 text-green-700 dark:bg-green-700 dark:text-green-100' : ''}
            ${copyStatus === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-700 dark:text-red-100' : ''}
          `}>
            {copyMessage}
          </div>
        )}
      </div>
      <div className="flex-grow overflow-y-auto p-3 bg-gray-50 dark:bg-slate-600 rounded-md scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-slate-500 scrollbar-track-transparent">
        {isLoading ? (
          <p className="text-gray-500 dark:text-gray-400 italic">Loading...</p>
        ) : error ? (
          <p className="text-red-500 dark:text-red-400 whitespace-pre-wrap break-words">{error}</p>
        ) : paneType === 'source' && setText && !isReadOnly ? (
          <textarea
            value={text}
            onChange={handleTextChange}
            placeholder={placeholder}
            className="w-full h-full p-0 text-gray-800 dark:text-gray-100 bg-transparent resize-none focus:outline-none placeholder-gray-400 dark:placeholder-gray-500 whitespace-pre-wrap break-words"
            readOnly={isReadOnly || isLoading}
          />
        ) : (
          <p className={`whitespace-pre-wrap break-words ${displayPlaceholder ? 'text-gray-400 dark:text-gray-500 italic' : 'text-gray-800 dark:text-gray-100'}`}>
            {displayPlaceholder ? placeholder : text}
          </p>
        )}
      </div>
    </div>
  );
} 