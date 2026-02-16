import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors());

const PORT = process.env.PORT || 8080;
const AUTH_KEY = process.env.AUTH_KEY || "RAKSHAK_H_2026";
const API_KEY = process.env.API_KEY;

const processedFinalSessions = new Set();

// --- HELPER: Language Detector ---
function detectLanguage(text) {
  // Simple check: if text contains Hindi characters or common Hinglish words, return Hinglish
  const hinglishPatterns = /[\u0900-\u097F]|bhaiya|ruko|nahi|acha|theek|kya|hai/i;
  return hinglishPatterns.test(text) ? "Hinglish" : "English";
}

async function callAI(messages, jsonMode = false) {
  const body = { 
    model: "google/gemini-2.0-flash-001", 
    messages,
    max_tokens: 200,
    temperature: 0.7 
  };
  if (jsonMode) body.response_format = { type: "json_object" };

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  return data.choices[0].message.content;
}

app.post("/honeypot", async (req, res) => {
  if (req.headers['x-api-key'] !== AUTH_KEY) return res.status(401).json({ status: "error", message: "Unauthorized" });

  const { sessionId, message, conversationHistory = [] } = req.body;
  const scammerText = typeof message === 'string' ? message : message.text;

  // 1. Detect Scammer's Language
  const detectedLang = detectLanguage(scammerText);

  try {
    const aiMessages = [
      { 
        role: "system", 
        content: `You are Rakshak-H, a scam-honeypot AI agent. 
        Current Goal: Engage the scammer in ${detectedLang} ONLY. 
        
        STRICT RULES:
        1. LANGUAGE: If the detected language is English, do NOT use Hindi/Hinglish words. If Hinglish, use a mix.
        2. PERSONA: You are Ramesh, a retired clerk. You are eager to cooperate but tech-illiterate.
        3. EXTRACTION: Force them to provide a UPI ID or Bank Account by claiming the app/link they sent is not working. 
        4. REPETITION: Use different excuses. If you used "slow net", now use "low battery" or "app crashing".
        5. TONE: 1-2 natural sentences. Stay in character as a confused human.` 
      },
      ...conversationHistory.map(h => ({ role: h.sender === "scammer" ? "user" : "assistant", content: h.text })),
      { role: "user", content: scammerText }
    ];

    let reply = await callAI(aiMessages);
    reply = reply.trim();

    // 2. Intelligence Extraction & GUVI Callback
    const isStop = /police|bye|stop|done/i.test(scammerText + reply);
    if ((conversationHistory.length >= 16 || isStop) && !processedFinalSessions.has(sessionId)) {
      processedFinalSessions.add(sessionId);
      
      const intelPrompt = `Extract as JSON: {bankAccounts:[], upiIds:[], phishingLinks:[], phoneNumbers:[], suspiciousKeywords:[], agentNotes:""} from: ${conversationHistory.map(h => h.text).join(" ")} ${scammerText}`;
      
      callAI([{ role: "system", content: intelPrompt }], true).then(async (intelRaw) => {
        const intel = JSON.parse(intelRaw);
        await fetch("https://hackathon.guvi.in/api/updateHoneyPotFinalResult", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            scamDetected: true,
            totalMessagesExchanged: conversationHistory.length + 2,
            extractedIntelligence: intel,
            agentNotes: intel.agentNotes || "Extracted SCAMMER details using
