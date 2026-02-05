
import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Plus, 
  History, 
  Settings, 
  PanelRight, 
  Trash2,
  AlertCircle,
  X
} from 'lucide-react';
import { rakshak } from './services/geminiService';
import { Message, Session } from './types';
import { ChatInterface } from './components/ChatInterface';
import { IntelligencePanel } from './components/IntelligencePanel';

function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isReporting, setIsReporting] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentSession = sessions.find(s => s.id === currentSessionId);

  useEffect(() => {
    if (sessions.length === 0) {
      createNewSession();
    }
  }, []);

  useEffect(() => {
    if (currentSession?.report && !isPanelOpen) {
      setIsPanelOpen(true);
    }
  }, [currentSession?.report]);

  const handleSendMessage = async (content: string) => {
    if (!currentSessionId) return;
    setError(null);

    const userMessage: Message = {
      role: 'user',
      content,
      timestamp: Date.now()
    };

    const updatedMessages = [...(currentSession?.messages || []), userMessage];
    
    setSessions(prev => prev.map(s => 
      s.id === currentSessionId 
        ? { ...s, messages: updatedMessages, lastActive: Date.now() } 
        : s
    ));

    setIsProcessing(true);
    try {
      const rawResponse = await rakshak.getChatResponse(updatedMessages);
      
      // 1. Check for Auto-Termination JSON
      if (rawResponse.trim().startsWith('{') && rawResponse.trim().endsWith('}')) {
        try {
          const report = JSON.parse(rawResponse);
          if (report.scam_detected !== undefined) {
            setSessions(prev => prev.map(s => 
              s.id === currentSessionId 
                ? { ...s, report, title: report.scam_type || s.title } 
                : s
            ));
            setIsProcessing(false);
            return;
          }
        } catch (e) {}
      }

      // 2. Parse [DELAY: X min] tag
      let delayMs = 1500;
      let cleanText = rawResponse;
      const delayMatch = rawResponse.match(/\[DELAY:\s*(\d+)\s*min\]/i);
      if (delayMatch) {
        const mins = parseInt(delayMatch[1]);
        // Scaled for demo: 1 min = 2s delay
        delayMs = Math.max(1000, mins * 2000); 
        cleanText = rawResponse.replace(/\[DELAY:\s*\d+\s*min\]/gi, '').trim();
      }

      // 3. Exactly ONE message per turn
      setTimeout(() => {
        const botMessage: Message = {
          role: 'model',
          content: cleanText,
          timestamp: Date.now()
        };
        
        setSessions(prev => {
          const session = prev.find(s => s.id === currentSessionId);
          if (!session) return prev;
          return prev.map(s => 
            s.id === currentSessionId 
              ? { ...s, messages: [...s.messages, botMessage], lastActive: Date.now() } 
              : s
          );
        });

        setIsProcessing(false);
      }, delayMs);

    } catch (error: any) {
      console.error("Chat error", error);
      setIsProcessing(false);
      const isQuota = error?.message?.includes('429') || error?.status === 429;
      setError(isQuota 
        ? "API Quota Exceeded. Please wait a minute and try again." 
        : "Failed to connect to the agent. Please check your network."
      );
    }
  };

  const handleGenerateReport = async () => {
    if (!currentSession || currentSession.messages.length === 0) return;
    setIsReporting(true);
    setError(null);
    try {
      const report = await rakshak.generateReport(currentSession.messages);
      setSessions(prev => prev.map(s => 
        s.id === currentSessionId ? { ...s, report, title: report.scam_type || s.title } : s
      ));
    } catch (error: any) {
      console.error("Report generation failed", error);
      const isQuota = error?.message?.includes('429') || error?.status === 429;
      setError(isQuota 
        ? "API Quota Exceeded. Report generation failed." 
        : "Extraction failed due to a service error."
      );
    } finally {
      setIsReporting(false);
    }
  };

  const createNewSession = () => {
    const newId = crypto.randomUUID();
    const newSession: Session = {
      id: newId,
      title: "New Case",
      messages: [],
      lastActive: Date.now()
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newId);
    setError(null);
  };

  const deleteSession = (id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    if (currentSessionId === id) setCurrentSessionId(null);
  };

  return (
    <div className="flex h-screen bg-white text-slate-800 font-sans relative">
      {/* Error Toast */}
      {error && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-full max-w-md px-4 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg shadow-lg flex items-start gap-3">
            <AlertCircle className="shrink-0 mt-0.5" size={18} />
            <div className="flex-1">
              <p className="text-sm font-semibold">Service Error</p>
              <p className="text-xs opacity-90">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded-md transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* LEFT SIDEBAR */}
      <aside className="w-64 border-r border-slate-100 flex flex-col bg-slate-50/50 hidden md:flex">
        <div className="p-4 flex items-center gap-2 mb-4">
          <Shield size={20} className="text-teal-600" />
          <span className="font-bold text-slate-900 tracking-tight">Rakshak-H</span>
        </div>

        <div className="px-3 mb-6">
          <button 
            onClick={createNewSession}
            className="w-full flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm"
          >
            <Plus size={16} />
            New Case
          </button>
        </div>

        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3 mb-2">History</div>
          {sessions.map(s => (
            <div key={s.id} className="group relative">
              <button
                onClick={() => { setCurrentSessionId(s.id); setError(null); }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all text-left truncate ${
                  currentSessionId === s.id ? 'bg-slate-200/50 text-slate-900 font-medium' : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                <History size={16} />
                <span className="truncate">{s.title}</span>
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-100">
          <button className="w-full flex items-center gap-2 px-3 py-2 text-slate-500 hover:text-slate-800 text-sm">
            <Settings size={16} />
            Settings
          </button>
        </div>
      </aside>

      {/* MAIN CHAT AREA */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-12 border-b border-slate-100 flex items-center justify-between px-6 bg-white/80 backdrop-blur-sm sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Rakshak-H <span className="mx-2">•</span> <span className="text-teal-600 font-bold">Human Simulation Active</span>
            </h2>
          </div>
          <button 
            onClick={() => setIsPanelOpen(!isPanelOpen)}
            className={`p-2 rounded-md transition-colors ${isPanelOpen ? 'text-teal-600 bg-teal-50' : 'text-slate-400 hover:bg-slate-100'}`}
            title="Toggle Intelligence Panel"
          >
            <PanelRight size={20} />
          </button>
        </header>

        <div className="flex-1 overflow-hidden relative">
          <ChatInterface 
            messages={currentSession?.messages || []}
            onSendMessage={handleSendMessage}
            onGenerateReport={handleGenerateReport}
            isProcessing={isProcessing}
            isReporting={isReporting}
            isTerminated={!!currentSession?.report}
          />
        </div>
      </main>

      {/* RIGHT INTELLIGENCE PANEL */}
      {isPanelOpen && (
        <aside className="w-80 border-l border-slate-100 bg-slate-50/30 flex flex-col animate-in slide-in-from-right duration-300">
          <IntelligencePanel 
            entities={currentSession?.report?.extracted_entities || null} 
            scamType={currentSession?.report?.scam_type}
            onClose={() => setIsPanelOpen(false)}
          />
        </aside>
      )}
    </div>
  );
}

export default App;
