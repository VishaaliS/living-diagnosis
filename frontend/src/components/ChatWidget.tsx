'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, X, Send, AlertTriangle, Bot, ChevronDown } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  crisis?: boolean;
  timestamp: Date;
}

export interface ChatWidgetProps {
  analysisContext?: any;
  page?: "analysis" | "profile" | "documents";
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INITIAL_MESSAGE: Message = {
  id: 'init',
  role: 'assistant',
  content:
    "Hi — I'm the Living Diagnosis assistant. I can explain what this website does, why we ask for specific information, how to use each feature, and what your analysis results mean. I cannot diagnose or give treatment advice.",
  timestamp: new Date(),
};

const STARTER_CHIPS = [
  "What does this website do?",
  "How do I use this app?",
  "Why do you ask for daily check-ins?",
  "Why upload prescriptions?",
  "What does my Freshness Score mean?",
  "What should I do next?",
];

const API_BASE = "http://localhost:8000";
const MAX_MESSAGES = 10;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2 mb-4">
      <div className="w-7 h-7 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
        <Bot className="w-3.5 h-3.5 text-indigo-400" />
      </div>
      <div className="bg-white/5 border border-white/10 rounded-2xl rounded-bl-sm px-4 py-3">
        <div className="flex gap-1 items-center h-4">
          <span
            className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce"
            style={{ animationDelay: "0ms" }}
          />
          <span
            className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce"
            style={{ animationDelay: "300ms" }}
          />
        </div>
      </div>
    </div>
  );
}

interface MessageBubbleProps {
  message: Message;
}

function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  if (message.crisis) {
    return (
      <div className="mb-4 mx-1">
        <div className="bg-red-950/60 border-2 border-red-500/60 rounded-2xl px-4 py-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="text-red-300 text-xs font-semibold uppercase tracking-wider">
              Safety Notice
            </span>
          </div>
          <p className="text-red-100 text-sm leading-relaxed whitespace-pre-wrap">
            {message.content}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-end gap-2 mb-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
          <Bot className="w-3.5 h-3.5 text-indigo-400" />
        </div>
      )}
      <div
        className={`max-w-[78%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
          isUser
            ? 'bg-indigo-600 text-white rounded-br-sm ml-auto'
            : 'bg-white/5 border border-white/10 text-slate-200 rounded-bl-sm'
        }`}
      >
        {message.content}
      </div>
    </div>
  );
}

// ─── Main Widget ──────────────────────────────────────────────────────────────

export default function ChatWidget({ analysisContext, page = "analysis" }: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive or typing indicator appears
  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  useEffect(() => {
    if (isOpen) {
      scrollToBottom(false);
    }
  }, [isOpen, scrollToBottom]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  // Track scroll position to show/hide "scroll to bottom" button
  const handleScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollDown(distanceFromBottom > 80);
  };

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isTyping) return;

      // Add user message
      const userMsg: Message = {
        id: generateId(),
        role: 'user',
        content: trimmed,
        timestamp: new Date(),
      };

      setMessages((prev) => {
        const updated = [...prev, userMsg];
        // Keep only last MAX_MESSAGES
        return updated.slice(-MAX_MESSAGES);
      });
      setInputValue('');
      setIsTyping(true);

      try {
        // Build history from current messages (last 10, converted to {role, content})
        const historyForApi = messages
          .filter((m) => m.id !== 'init')
          .slice(-10)
          .map((m) => ({ role: m.role, content: m.content }));

        // Build site-aware context with page, features, and analysis state
        const siteContext = {
          analysis: analysisContext ?? null,
          page,
          visible_features:
            page === "analysis"
              ? [
                  "patient notes input",
                  "analyze notes button",
                  "freshness score",
                  "extracted clinical data",
                  "guideline match",
                  "diagnosis timeline",
                  "doctor questions",
                  "profile link",
                  "document upload",
                  "chat assistant",
                ]
              : page === "profile"
              ? [
                  "patient details",
                  "daily check-in form",
                  "mood history",
                  "diagnosis freshness history",
                  "medication list",
                  "uploaded documents",
                ]
              : [
                  "document upload",
                  "prescription storage",
                  "uploaded file list",
                ],
          user_state: {
            has_analysis_result: Boolean(analysisContext),
            diagnosis: analysisContext?.extracted?.diagnosis ?? null,
            diagnosis_year: analysisContext?.extracted?.diagnosis_year ?? null,
            score: analysisContext?.freshness_score ?? null,
            has_guideline_match: Boolean(analysisContext?.guideline_match?.matched),
            guideline_match: analysisContext?.guideline_match ?? null,
            explanation: analysisContext?.explanation ?? null,
          },
        };

        console.log("Sending chat context:", siteContext);

        const res = await fetch(`${API_BASE}/chat/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: trimmed,
            context: siteContext,
            history: historyForApi,
          }),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data: { response: string; crisis_triggered: boolean } = await res.json();

        const aiMsg: Message = {
          id: generateId(),
          role: 'assistant',
          content: data.response,
          crisis: data.crisis_triggered,
          timestamp: new Date(),
        };

        setMessages((prev) => {
          const updated = [...prev, aiMsg];
          return updated.slice(-MAX_MESSAGES);
        });
      } catch {
        const errMsg: Message = {
          id: generateId(),
          role: 'assistant',
          content:
            "Sorry, I couldn't process that right now. Please try again.",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errMsg].slice(-MAX_MESSAGES));
      } finally {
        setIsTyping(false);
      }
    },
    [isTyping, messages, analysisContext, page]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputValue);
    }
  };

  const handleChipClick = (chip: string) => {
    sendMessage(chip);
  };

  // Show chips only when there's just the initial message
  const showChips = messages.length <= 1;

  return (
    <>
      {/* ── Floating Trigger Button ─────────────────────────────────────── */}
      <button
        id="chat-widget-trigger"
        aria-label="Ask Living Diagnosis"
        title="Ask Living Diagnosis"
        onClick={() => setIsOpen((v) => !v)}
        className={`
          fixed bottom-6 right-6 z-50
          w-14 h-14 rounded-full shadow-lg
          flex items-center justify-center
          transition-transform duration-300 ease-out
          focus:outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2
          ${isOpen
            ? 'bg-slate-700 hover:bg-slate-600 rotate-90 scale-95 text-white'
            : 'bg-[#D7FF3F] hover:scale-105 text-[#0B0B0B]'
          }
        `}
      >
        {isOpen ? (
          <X className="w-5 h-5" />
        ) : (
          <MessageCircle className="w-6 h-6" />
        )}
      </button>

      {/* ── Slide-out Chat Panel ────────────────────────────────────────── */}
      <div
        id="chat-widget-panel"
        aria-label="Living Diagnosis Assistant"
        className={`
          fixed bottom-0 right-0 z-40
          w-full sm:w-[380px] h-[100dvh] sm:h-[600px] sm:bottom-24 sm:right-6
          sm:rounded-2xl overflow-hidden
          flex flex-col
          transition-all duration-300 ease-out
          origin-bottom-right
          ${isOpen
            ? 'opacity-100 scale-100 pointer-events-auto'
            : 'opacity-0 scale-95 pointer-events-none'
          }
        `}
        style={{
          background: 'linear-gradient(145deg, rgba(15,23,42,0.97) 0%, rgba(30,27,75,0.97) 100%)',
          backdropFilter: 'blur(24px)',
          border: '1px solid rgba(99,102,241,0.2)',
          boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,102,241,0.1)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-4 shrink-0"
          style={{
            background: 'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(139,92,246,0.10) 100%)',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
              <Bot className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm leading-tight">
                Living Diagnosis Assistant
              </p>
              <p className="text-slate-400 text-xs">Ask about this app or your results</p>
            </div>
          </div>
          <button
            id="chat-widget-close"
            aria-label="Close chat"
            onClick={() => setIsOpen(false)}
            className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Safety disclaimer strip */}
        <div className="px-4 py-2 shrink-0 flex items-center gap-2 bg-amber-950/30 border-b border-amber-500/10">
          <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
          <p className="text-amber-300/80 text-[10px] leading-tight">
            Not a diagnostic tool. Always consult a licensed mental health professional.
          </p>
        </div>

        {/* Messages */}
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-0 scroll-smooth"
          style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(99,102,241,0.3) transparent' }}
        >
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {isTyping && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </div>

        {/* Scroll-to-bottom button */}
        {showScrollDown && (
          <button
            onClick={() => scrollToBottom()}
            className="absolute bottom-24 right-4 w-8 h-8 rounded-full bg-indigo-600/80 hover:bg-indigo-500 flex items-center justify-center shadow-lg transition-all"
            aria-label="Scroll to bottom"
          >
            <ChevronDown className="w-4 h-4 text-white" />
          </button>
        )}

        {/* Starter Chips */}
        {showChips && (
          <div className="px-4 pb-3 shrink-0 flex flex-wrap gap-2">
            {STARTER_CHIPS.map((chip) => (
              <button
                key={chip}
                onClick={() => handleChipClick(chip)}
                disabled={isTyping}
                className="
                  text-xs px-3 py-1.5 rounded-full
                  bg-white/5 hover:bg-indigo-500/20
                  border border-white/10 hover:border-indigo-500/40
                  text-slate-300 hover:text-white
                  transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed
                "
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        {/* Input area */}
        <div
          className="px-4 py-3 shrink-0 flex gap-2 items-end"
          style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
        >
          <textarea
            ref={inputRef}
            id="chat-widget-input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about the app or your results…"
            rows={1}
            disabled={isTyping}
            className="
              flex-1 resize-none rounded-xl px-4 py-3 text-sm
              bg-white/5 border border-white/10
              text-slate-100 placeholder-slate-500
              focus:outline-none focus:border-indigo-500/50 focus:bg-white/8
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors duration-150 leading-snug
            "
            style={{ maxHeight: '120px', overflowY: 'auto' }}
            onInput={(e) => {
              // Auto-grow textarea
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
            }}
          />
          <button
            id="chat-widget-send"
            onClick={() => sendMessage(inputValue)}
            disabled={isTyping || !inputValue.trim()}
            aria-label="Send message"
            className="
              w-10 h-10 rounded-xl
              bg-indigo-600 hover:bg-indigo-500
              disabled:bg-slate-700 disabled:cursor-not-allowed
              flex items-center justify-center
              transition-all duration-150
              shrink-0 self-end
            "
          >
            <Send className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      {/* ── Backdrop for mobile ─────────────────────────────────────────── */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 sm:hidden"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}
    </>
  );
}
