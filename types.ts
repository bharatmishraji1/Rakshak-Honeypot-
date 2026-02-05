export interface Message {
  role: 'user' | 'model';
  content: string;
  timestamp: number;
}

export interface ExtractedEntities {
  upi_ids: string[];
  bank_accounts: string[];
  phone_numbers: string[];
  urls: string[];
}

export interface ScamReport {
  scam_detected: boolean;
  scam_type: string;
  confidence_score: number;
  extracted_entities: ExtractedEntities;
  conversation_summary: string;
}

export interface Session {
  id: string;
  title: string;
  messages: Message[];
  report?: ScamReport;
  lastActive: number;
}
