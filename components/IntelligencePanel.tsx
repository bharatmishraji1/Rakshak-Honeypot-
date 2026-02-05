
import React from 'react';
import { Shield, CheckCircle2, Circle, Smartphone, Globe, CreditCard, AlertTriangle, X } from 'lucide-react';
import { ExtractedEntities } from '../types';

interface IntelligencePanelProps {
  entities: ExtractedEntities | null;
  scamType?: string;
  onClose: () => void;
}

export const IntelligencePanel: React.FC<IntelligencePanelProps> = ({ entities, scamType, onClose }) => {
  const steps = [
    { label: 'UPI ID Extraction', key: 'upi_ids' },
    { label: 'Phishing URL Tracking', key: 'urls' },
    { label: 'Phone Number Capture', key: 'phone_numbers' },
    { label: 'Bank Detail Discovery', key: 'bank_accounts' },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-50/50">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Intelligence</h3>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
          <X size={16} />
        </button>
      </div>

      <div className="p-6 space-y-8 overflow-y-auto">
        {/* PROGRESS VIEW */}
        <div className="space-y-4">
          <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Extraction Status</h4>
          <div className="space-y-3">
            {steps.map(step => {
              const isCaptured = entities && (entities[step.key as keyof ExtractedEntities]?.length || 0) > 0;
              return (
                <div key={step.label} className="flex items-center gap-3">
                  {isCaptured ? (
                    <CheckCircle2 size={16} className="text-teal-600" />
                  ) : (
                    <Circle size={16} className="text-slate-200" />
                  )}
                  <span className={`text-xs font-medium ${isCaptured ? 'text-slate-900' : 'text-slate-400'}`}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* DETECTED ARTIFACTS */}
        {entities ? (
          <div className="space-y-6 pt-6 border-t border-slate-100">
            <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Captured Artifacts</h4>
            
            {scamType && (
              <div className="bg-orange-50 border border-orange-100 p-3 rounded-lg">
                <p className="text-[10px] font-bold text-orange-600 uppercase mb-1">Scam Type</p>
                <p className="text-xs font-medium text-slate-800">{scamType}</p>
              </div>
            )}

            {[
              { label: 'UPI IDs', icon: Smartphone, data: entities.upi_ids },
              { label: 'URLs', icon: Globe, data: entities.urls },
              { label: 'Numbers', icon: AlertTriangle, data: entities.phone_numbers },
              { label: 'Accounts', icon: CreditCard, data: entities.bank_accounts },
            ].map(section => section.data.length > 0 && (
              <div key={section.label} className="space-y-2">
                <div className="flex items-center gap-2">
                  <section.icon size={12} className="text-slate-400" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase">{section.label}</span>
                </div>
                <div className="space-y-1">
                  {section.data.map((item, idx) => (
                    <div key={idx} className="bg-white px-3 py-2 rounded-lg text-xs mono text-slate-700 border border-slate-100 shadow-sm break-all select-all">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-20 text-center space-y-3">
            <Shield size={32} className="mx-auto text-slate-100" />
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Waiting for engagement to start tracking intelligence artifacts.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
