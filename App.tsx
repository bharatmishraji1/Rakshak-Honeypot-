import React, { useState, useEffect, useMemo } from 'react';
import { 
  Shield, 
  Plus, 
  History, 
  Settings, 
  PanelRight, 
  Trash2,
  AlertCircle,
  X,
  Activity
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
  const [isPanelOpen, setIsPanelOpen] = useState(true); // Default open for impact
  const [error, setError] = useState<string | null>(null);

  const currentSession = sessions.find(s => s.id === currentSessionId);

  // --- 🧠 LIVE INTELLIGENCE TRACKING ---
  const intelStats = useMemo(() => {
    if (!currentSession?.report?.extracted_entities) return { count: 0, types: [] };
    const entities = currentSession.report.extracted_entities;
    const items = Object.entries(entities)
      .filter(([_, val]) => Array.isArray(val) && val.length > 0);
    return {
      count: items.reduce((acc, [_, val]) => acc + (val as string[]).length, 0),
      types: items.map(([key]) => key.replace('_', ' '))
    };
  }, [currentSession?.report]);

  useEffect(() => {
    if (sessions.length === 0) createNewSession();
  }, []);

  const handleSendMessage = async (content: string) => {
    if (!currentSessionId) return;
    setError(null);

    const userMessage: Message = { role: 'user', content, timestamp: Date.now() };
    const updatedMessages = [...(currentSession?.messages || []), userMessage];
    
    setSessions(prev => prev.map(s => 
      s.id === currentSessionId ? { ...s, messages: updatedMessages, lastActive: Date.now() } : s
    ));

    setIsProcessing(true);
    try {
      const rawResponse = await rakshak.getChatResponse(updatedMessages);
      
      // Auto-trigger intelligence extraction every 3 messages
      if (updatedMessages.length % 3 === 0) {
        handleGenerateReport();
      }

      // Handle termination or normal flow
      let cleanText = rawResponse.replace(/\[DELAY:\s*\d+\s*min\]/gi, '').trim();
      
      setTimeout(() => {
        const botMessage: Message = { role: 'model', content: cleanText, timestamp: Date.now() };
        setSessions(prev => prev.map(s => 
          s.id === currentSessionId ? { ...s, messages: [...s.messages, botMessage], lastActive: Date.now() } : s
        ));
        setIsProcessing(false);
      }, 1000);

    } catch (error: any) {
      setIsProcessing(false);
      setError("Connection lag detected. Scammer might be suspicious.");
    }
  };

  const handleGenerateReport = async () => {
    if (!currentSession || currentSession.messages.length < 2) return;
    setIsReporting(true);
    try {
      const report = await rakshak.generateReport(currentSession.messages);
      setSessions(prev => prev.map(s => 
        s.id === currentSessionId ? { ...s, report, title: report.scam_type || s.title } : s
      ));
    } catch (e) {
      console.error("Extraction silent fail");
    } finally {
      setIsReporting(false);
    }
  };

  const createNewSession = () => {
    const newId = crypto.randomUUID();
    setSessions(prev => [{ id: newId, title: "Active Case", messages: [], lastActive: Date.now() }, ...prev]);
    setCurrentSessionId(newId);
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 font-sans overflow-hidden">
      {/* SIDEBAR */}
      <aside className="w-64 border-r border-slate-200 bg-white flex flex-col hidden lg:flex">
        <div className="p-6 flex items-center gap-3 border-b border-slate-50">
          <div className="bg-teal-600 p-1.5 rounded-lg text-white">
            <Shield size={22} />
          </div>
          <span className="font-black text-xl text-slate-900 tracking-tighter">RAKSHAK-H</span>
        </div>
        
        <div className="p-4">
          <button onClick={createNewSession} className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all shadow-md">
            <Plus size={18} /> INITIATE NEW TRAP
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-2 overflow-y-auto pt-2">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">Live Sessions</p>
          {sessions.map(s => (
            <button key={s.id} onClick={() => setCurrentSessionId(s.id)} className={`w-full text-left p-3 rounded-xl text-sm transition-all group relative ${currentSessionId === s.id ? 'bg-teal-50 text-teal-700 font-bold border border-teal-100' : 'hover:bg-slate-100 text-slate-500'}`}>
              <div className="flex items-center gap-3">
                <Activity size={14} className={currentSessionId === s.id ? 'animate-pulse' : ''} />
                <span className="truncate">{s.title}</span>
              </div>
            </button>
          ))}
        </nav>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col bg-white">
        <header className="h-16 border-b border-slate-100 flex items-center justify-between px-8 bg-white/50 backdrop-blur-xl sticky top-0 z-30">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
              <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">Honeypot Active</h2>
            </div>
            <div className="flex gap-2 mt-1">
              <span className="text-[10px] font-bold px-2 py-0.5 bg-teal-100 text-teal-700 rounded-md">INTEL: {intelStats.count}/4</span>
              <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md">TURNS: {currentSession?.messages.length || 0}</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button onClick={handleGenerateReport} disabled={isReporting} className="text-[11px] font-black text-teal-600 uppercase border-b-2 border-teal-600 pb-0.5 hover:text-teal-700 transition-all">
              {isReporting ? 'EXTRACTING...' : 'FORCE EXTRACTION'}
            </button>
            <button onClick={() => setIsPanelOpen(!isPanelOpen)} className={`p-2 rounded-xl transition-all ${isPanelOpen ? 'bg-teal-50 text-teal-600' : 'text-slate-300 hover:bg-slate-50'}`}>
              <PanelRight size={22} />
            </button>
          </div>
        </header>

        <div className="flex-1 relative overflow-hidden">
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

      {/* INTELLIGENCE PANEL */}
      {isPanelOpen && (
        <aside className="w-96 border-l border-slate-100 bg-slate-50/50 backdrop-blur-md flex flex-col animate-in slide-in-from-right duration-500">
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
