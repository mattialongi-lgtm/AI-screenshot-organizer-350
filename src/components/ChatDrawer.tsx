/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Sparkles, MessageSquare, Loader2, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { ScreenshotMetadata } from '../types';

interface ChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSendMessage: (text: string) => Promise<{ answer: string, used_ids: (string | number)[] }>;
  screenshots: ScreenshotMetadata[];
}

export const ChatDrawer: React.FC<ChatDrawerProps> = ({ 
  isOpen, 
  onClose, 
  onSendMessage,
  screenshots
}) => {
  const [messages, setMessages] = useState<{ role: 'user' | 'ai', text: string, ids?: (string | number)[] }[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsLoading(true);

    try {
      const response = await onSendMessage(userMsg);
      setMessages(prev => [...prev, { role: 'ai', text: response.answer, ids: response.used_ids }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'ai', text: "Sorry, I encountered an error. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-ink/80 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-lg bg-ink shadow-2xl flex flex-col border-l border-white/10"
          >
            <div className="p-10 border-b border-white/10 flex items-center justify-between bg-ink">
              <div className="flex items-center gap-6">
                <div className="w-12 h-12 bg-accent flex items-center justify-center rotate-3">
                  <Sparkles className="w-6 h-6 text-ink" />
                </div>
                <div>
                  <h2 className="text-2xl font-serif italic leading-none">Query Engine</h2>
                  <p className="mono-label mt-1 text-[9px]">Neural Archive Search</p>
                </div>
              </div>
              <button onClick={onClose} className="w-12 h-12 border border-white/10 flex items-center justify-center hover:bg-bone hover:text-ink transition-all">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-10 space-y-10 no-scrollbar bg-white/[0.01]">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-8 px-10">
                  <div className="w-20 h-20 border border-white/5 flex items-center justify-center rotate-45">
                    <MessageSquare className="w-8 h-8 text-white/10 -rotate-45" />
                  </div>
                  <div className="space-y-4">
                    <p className="text-2xl font-serif italic text-bone">Awaiting Input</p>
                    <p className="mono-label text-[10px] leading-relaxed opacity-50 max-w-[240px] mx-auto">
                      "Analyze financial trends from recent receipts" or "Extract contact data from business cards."
                    </p>
                  </div>
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className="mono-label text-[8px] mb-2 opacity-30">
                    {msg.role === 'user' ? 'LOCAL_USER' : 'ARCHIVE_CORE'}
                  </div>
                  <div className={`
                    max-w-[90%] p-6 text-sm leading-relaxed
                    ${msg.role === 'user' 
                      ? 'bg-accent text-ink font-medium' 
                      : 'bg-white/[0.03] text-bone border border-white/5 font-light'}
                  `}>
                    <div className="markdown-body">
                      <ReactMarkdown>{msg.text}</ReactMarkdown>
                    </div>
                  </div>
                  {msg.ids && msg.ids.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {msg.ids.map(id => {
                        const s = screenshots.find(sc => sc.id === id);
                        if (!s) return null;
                        return (
                          <div key={id} className="mono-label text-[8px] border border-white/10 px-2 py-1 flex items-center gap-2">
                            <ChevronRight className="w-2 h-2 text-accent" />
                            Ref: {s.category}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex flex-col items-start">
                  <div className="mono-label text-[8px] mb-2 opacity-30">ARCHIVE_CORE</div>
                  <div className="bg-white/[0.03] p-6 border border-white/5">
                    <Loader2 className="w-4 h-4 text-accent animate-spin" />
                  </div>
                </div>
              )}
            </div>

            <div className="p-10 bg-ink border-t border-white/10">
              <form onSubmit={handleSend} className="relative flex gap-4">
                <input 
                  type="text" 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Execute query..."
                  className="flex-1 bg-transparent border-b border-white/10 py-4 px-2 text-sm focus:border-accent focus:ring-0 transition-all placeholder:text-muted/30 text-bone"
                />
                <button 
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="accent-button !px-4 !py-0 flex items-center justify-center disabled:opacity-30 disabled:grayscale"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
