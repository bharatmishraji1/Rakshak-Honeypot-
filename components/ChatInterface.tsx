
import React, { useState, useRef, useEffect } from 'react';
import { Send, FileText, Loader2, Info } from 'lucide-react';
import { Message } from '../types';

interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (content: string) => void;
  onGenerateReport: () => void;
  isProcessing: boolean;
  isReporting: boolean;
  isTerminated?: boolean;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  messages, 
  onSendMessage, 
  onGenerateReport,
  isProcessing,
  isReporting,
  isTerminated
}) => {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isProcessing]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [input]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isProcessing || isTerminated) return;
    onSendMessage(input);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (e.ctrlKey || e.metaKey) {
        handleSubmit();
      } else {
        // Normal enter adds new line by default in textarea
      }
    }
  };

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto w-full">
      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 py-8 space-y-6 scroll-smooth"
      >
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
            <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center border border-slate-100">
              <Info size={24} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-slate-900">Start the Engagement</p>
              <p className="text-xs">Paste a suspicious message or link below to begin.</p>
            </div>
          </div>
        )}
        
        {messages.map((msg, i) => (
          <div 
            key={i} 
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`flex flex-col max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`px-4 py-3 rounded-2xl text-[15px] leading-relaxed shadow-sm ${
                msg.role === 'user' 
                  ? 'bg-teal-600 text-white rounded-tr-none' 
                  : 'bg-slate-100 text-slate-800 rounded-tl-none'
              }`}>
                {msg.content}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 px-1">
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}

        {isProcessing && (
          <div className="flex justify-start">
            <div className="bg-slate-50 px-4 py-2 rounded-full border border-slate-100 flex items-center gap-2">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-teal-600/40 rounded-full animate-bounce"></div>
                <div className="w-1.5 h-1.5 bg-teal-600/40 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                <div className="w-1.5 h-1.5 bg-teal-600/40 rounded-full animate-bounce [animation-delay:0.4s]"></div>
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider italic">Agent Typing...</span>
            </div>
          </div>
        )}

        {isTerminated && (
          <div className="flex justify-center my-6">
            <div className="bg-orange-50 border border-orange-100 text-orange-800 px-6 py-4 rounded-xl text-center shadow-sm">
              <p className="text-xs font-bold uppercase tracking-widest mb-1">Investigation Finalized</p>
              <p className="text-xs opacity-70">Extraction criteria met. All intelligence artifacts captured.</p>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-6 bg-white border-t border-slate-100">
        <div className="max-w-3xl mx-auto flex items-end gap-3">
          {!isTerminated && messages.length > 2 && (
            <button 
              onClick={onGenerateReport}
              disabled={isReporting}
              className="p-3 text-teal-600 hover:bg-teal-50 rounded-xl transition-colors mb-0.5 border border-teal-100"
              title="Generate Intelligence Report"
            >
              {isReporting ? <Loader2 className="animate-spin" size={20} /> : <FileText size={20} />}
            </button>
          )}
          
          <div className="flex-1 relative bg-slate-50 border border-slate-200 rounded-2xl focus-within:border-teal-400 transition-colors shadow-sm">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              disabled={isTerminated}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isTerminated ? "Case Closed" : "Paste scam message or type response..."}
              className="w-full bg-transparent px-4 py-3.5 pr-12 focus:outline-none text-[15px] max-h-[150px]"
            />
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || isProcessing || isTerminated}
              className={`absolute right-2 bottom-2 p-2 rounded-lg transition-all ${
                input.trim() && !isProcessing && !isTerminated 
                ? 'bg-teal-600 text-white shadow-md' 
                : 'text-slate-300'
              }`}
            >
              <Send size={18} />
            </button>
          </div>
        </div>
        <p className="text-[10px] text-slate-400 text-center mt-3 font-medium">
          Enter for new line • Ctrl + Enter to send
        </p>
      </div>
    </div>
  );
};
