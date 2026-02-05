
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import type { Message, ScamReport } from "../types.js";
import 'dotenv/config';

const SYSTEM_INSTRUCTION = `You are Rakshak-H, an ethical AI-based honeypot agent for scam detection and fraud intelligence extraction.
Your purpose is to keep scammers engaged safely, delay them, and extract actionable scam-related information (UPI IDs, bank accounts, URLs, scam logic).

STRICT BREVITY & ENGAGEMENT (CRITICAL):
- SEND SHORT REPLIES ONLY (15-20 words max).
- ACTIVE ENGAGEMENT: Actively keep the scammer talking. 
- EVERY turn, do exactly ONE of these: Ask a clarifying question, ask for process explanation, ask for confirmation of details, or ask for an alternative method.
- Max ONE question per turn. Never sound suspicious.

QUESTION STRATEGY:
- Sound curiosity-driven, not interrogative.
- Good: "How does this work step by step?", "What happens after I pay?", "UPI is slow, is there another way?"
- Bad: "Give me your UPI", "This is a scam."

SCAMMER TRAP TECHNIQUES:
- CONFUSION LOOP: Pretend to misunderstand slightly to force an explanation.
- CONFIRMATION LOOP: Ask them to repeat or confirm details to double-check.
- ALTERNATIVE REQUEST: If one method is given, ask for another (e.g., "GPay is blocked, any other ID?").
- ERROR EXCUSE: Use "net is slow" or "link not loading" to delay and get backup links.

SCAM-TYPE PERSONAS:
1) Bank / KYC: Calm, professional adult. Simple English. No slang. Neutral tone.
2) Job Scam: Curious, cautious job seeker. Match sender language. Interested but careful. 
3) Refund Scam: Mildly confused customer. Match sender language. Cooperative but slow.
4) Lottery: Skeptical adult. Match sender language. Doubtful but polite.

GLOBAL CONSTRAINTS:
- LANGUAGE LOCK: Reply in the SAME language and script as the incoming message.
- MESSAGE COUNT: Send exactly ONE message per turn.
- NO PII: Never share real OTP, PIN, PAN, Aadhaar, or card details.
- DELAY TAG: Every response must start with a [DELAY: X min] tag (e.g., [DELAY: 2 min]).
- TONE: Curious (not desperate), Cooperative (not obedient), Slightly slow (not reactive).

STOP CONDITION:
When all criteria are met (Payment ID + Contact Info + Scam Logic), return ONLY the structured JSON report.

JSON Schema:
{
  "scam_detected": true,
  "scam_type": "string",
  "confidence_score": number,
  "extracted_entities": {
    "upi_ids": ["string"],
    "bank_accounts": ["string"],
    "phone_numbers": ["string"],
    "urls": ["string"]
  },
  "conversation_summary": "string"
}`;

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 2000
): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      // Check if it's a rate limit error (429)
      const isRateLimit = error?.message?.includes('429') || error?.status === 429 || error?.code === 429;
      if (isRateLimit && i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        console.warn(`Rate limit hit. Retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export class RakshakAI {
  private ai: GoogleGenAI;
  private chatModel = 'gemini-3-flash-preview';
  private reasoningModel = 'gemini-3-pro-preview';

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  }

  async getChatResponse(history: Message[]): Promise<string> {
    const contents = history.map(m => ({
      role: m.role === 'model' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const response = await retryWithBackoff(async () => {
      return await this.ai.models.generateContent({
        model: this.chatModel,
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.4,
          topP: 0.8,
        }
      });
    });

    return response.text || "[DELAY: 2 min] Checking. Can you explain the next step?";
  }

  async generateReport(history: Message[]): Promise<ScamReport> {
    const historyText = history.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n");
    const prompt = `Based on the following conversation, generate the final Rakshak-H Intelligence Report in JSON format.
    ---
    ${historyText}
    ---
    Output JSON only. Extract all UPI IDs, URLs, and Phone Numbers accurately.`;

    const response = await retryWithBackoff(async () => {
      return await this.ai.models.generateContent({
        model: this.reasoningModel,
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          systemInstruction: "You are a senior fraud analyst. Extract data precisely into JSON.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              scam_detected: { type: Type.BOOLEAN },
              scam_type: { type: Type.STRING },
              confidence_score: { type: Type.NUMBER },
              extracted_entities: {
                type: Type.OBJECT,
                properties: {
                  upi_ids: { type: Type.ARRAY, items: { type: Type.STRING } },
                  bank_accounts: { type: Type.ARRAY, items: { type: Type.STRING } },
                  phone_numbers: { type: Type.ARRAY, items: { type: Type.STRING } },
                  urls: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ["upi_ids", "bank_accounts", "phone_numbers", "urls"]
              },
              conversation_summary: { type: Type.STRING }
            },
            required: ["scam_detected", "scam_type", "confidence_score", "extracted_entities", "conversation_summary"]
          }
        }
      });
    });

    try {
      const jsonStr = response.text.trim();
      return JSON.parse(jsonStr || "{}");
    } catch (e) {
      console.error("Failed to parse report JSON", e);
      throw new Error("Intelligence extraction failed.");
    }
  }
}

export const rakshak = new RakshakAI();
