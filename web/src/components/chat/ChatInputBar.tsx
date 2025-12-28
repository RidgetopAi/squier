'use client';

import { useState, useRef, useEffect, KeyboardEvent, useCallback } from 'react';
import { STTButton } from './STTButton';

interface ChatInputBarProps {
  onSend: (message: string) => void;
  isLoading?: boolean;
  placeholder?: string;
}

export function ChatInputBar({
  onSend,
  isLoading = false,
  placeholder = 'Type a message...',
}: ChatInputBarProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const justSubmittedRef = useRef(false);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [input]);

  // Focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Refocus after submission - aggressive multi-attempt approach
  useEffect(() => {
    if (justSubmittedRef.current && input === '') {
      // Multiple focus attempts to overcome any competing focus changes
      const focusInput = () => textareaRef.current?.focus();

      // Immediate attempt
      focusInput();
      // After microtask
      queueMicrotask(focusInput);
      // After paint
      requestAnimationFrame(focusInput);
      // After scroll animations (100ms covers most smooth scrolls)
      setTimeout(focusInput, 100);
      // Final fallback
      setTimeout(focusInput, 250);
      // Clear the flag after all attempts complete
      setTimeout(() => {
        justSubmittedRef.current = false;
      }, 500);
    }
  }, [input]);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (trimmed && !isLoading) {
      justSubmittedRef.current = true;
      onSend(trimmed);
      setInput('');
      // Reset height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter (without Shift) - but not while loading
    if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Prevent focus loss after submission - refocus immediately on blur
  const handleBlur = useCallback(() => {
    if (justSubmittedRef.current) {
      // Something stole focus right after submit - take it back
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    }
  }, []);

  // Handle speech-to-text transcript
  const handleSpeechTranscript = useCallback((text: string) => {
    setInput((prev) => {
      // Add space if there's existing text
      const newText = prev ? `${prev} ${text}` : text;
      return newText;
    });
    // Focus the textarea after speech input
    textareaRef.current?.focus();
  }, []);

  const canSend = input.trim().length > 0 && !isLoading;

  return (
    <div className="border-t border-glass-border bg-background-secondary p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-end gap-3">
          {/* Speech-to-text button */}
          <STTButton
            onTranscript={handleSpeechTranscript}
            disabled={isLoading}
          />

          {/* Text input */}
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => !isLoading && setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              placeholder={placeholder}
              aria-disabled={isLoading}
              rows={1}
              className={`
                w-full px-4 py-3 rounded-xl resize-none
                bg-background-tertiary border border-glass-border
                text-foreground placeholder-foreground-muted
                focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50
                transition-colors
                ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
              `}
              style={{ maxHeight: '200px' }}
            />
          </div>

          {/* Send button */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSend}
            className={`
              shrink-0 p-3 rounded-xl transition-all duration-200
              ${canSend
                ? 'bg-primary text-background hover:bg-primary-hover glow-primary'
                : 'bg-background-tertiary text-foreground-muted border border-glass-border'
              }
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
          >
            {isLoading ? (
              <svg
                className="w-5 h-5 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : (
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            )}
          </button>
        </div>

        {/* Helper text */}
        <p className="text-xs text-foreground-muted mt-2 text-center">
          Press <kbd className="px-1.5 py-0.5 rounded bg-background-tertiary text-foreground-muted">Enter</kbd> to send, <kbd className="px-1.5 py-0.5 rounded bg-background-tertiary text-foreground-muted">Shift+Enter</kbd> for new line
        </p>
      </div>
    </div>
  );
}
