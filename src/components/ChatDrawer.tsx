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
            className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-md bg-white dark:bg-slate-900 shadow-2xl flex flex-col border-l border-slate-100 dark:border-slate-800"
          >
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">AI Assistant</h2>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-bold">Ask your screenshots</p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar bg-slate-50/30 dark:bg-slate-950/30">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 px-6">
                  <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-3xl flex items-center justify-center shadow-sm border border-slate-100 dark:border-slate-700">
                    <MessageSquare className="w-8 h-8 text-indigo-500" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">Ask me anything</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                      "What was the total of my last Amazon receipt?" or "Find the email from the booking screenshot."
                    </p>
                  </div>
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`
                    max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed
                    ${msg.role === 'user' 
                      ? 'bg-indigo-600 text-white rounded-tr-none' 
                      : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 shadow-sm border border-slate-100 dark:border-slate-700 rounded-tl-none'}
                  `}>
                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                  </div>
                  {msg.ids && msg.ids.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {msg.ids.map(id => {
                        const s = screenshots.find(sc => sc.id === id);
                        if (!s) return null;
                        return (
                          <div key={id} className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-[10px] font-bold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                            <ChevronRight className="w-3 h-3" />
                            Ref: {s.category}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex items-start">
                  <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl rounded-tl-none border border-slate-100 dark:border-slate-700 shadow-sm">
                    <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
              <form onSubmit={handleSend} className="relative">
                <input 
                  type="text" 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask a question..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl px-5 py-4 pr-14 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all dark:text-white"
                />
                <button 
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="absolute right-2 top-2 bottom-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all disabled:opacity-50 disabled:hover:bg-indigo-600"
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
