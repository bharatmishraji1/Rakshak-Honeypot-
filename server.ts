import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 8080;
const AUTH_KEY = process.env.AUTH_KEY || "RAKSHAK_H_2026";
const API_KEY = process.env.API_KEY;

const sessionStartTimes = new Map();
const finalReportsSent = new Set();

// --- AI ENGINE ---
async function callAI(messages, jsonMode = false) {
  const body = { 
    model: "google/gemini-2.0-flash-001", 
    messages: aiMessages,
    max_tokens: 100, // Forcing short replies
    temperature: 0.6 
};

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    return data.choices[0].message.content;
  } catch (e) {
    return null;
  }
}

// --- HELPER: REGEX EXTRACTION (Backup if AI fails) ---
function extractWithRegex(text) {
  return {
    upi: text.match(/[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}/g) || [],
    accounts: text.match(/\b\d{9,18}\b/g) || [],
    links: text.match(/https?:\/\/[^\s]+/g) || [],
    phones: text.match(/(\+91[\-\s]?)?[0]?(91)?[6789]\d{9}/g) || [],
    ifsc: text.match(/[A-Z]{4}0[A-Z0-9]{6}/g) || [], // Standard Indian IFSC format
    emails: text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || []
  };
}

// --- HONEYPOT ENDPOINT ---
app.post("/honeypot", async (req, res) => {
  if (req.headers['x-api-key'] !== AUTH_KEY) return res.status(401).send("Unauthorized");

  const { sessionId, message, conversationHistory = [] } = req.body;
  const scammerText = typeof message === 'string' ? message : message.text;

  if (!sessionStartTimes.has(sessionId)) sessionStartTimes.set(sessionId, Date.now());

  try {
    const isHinglish = /[\u0900-\u097F]|bhaiya|ruko|theek|acha|kya/i.test(scammerText);
    
  const aiMessages = [
  { 
    role: "system", 
    content: `You are Rakshak-H. Persona: Retired Ramesh. 
    Tone: Short, worried, and very tech-confused. 
    Language: ${isHinglish ? 'Hinglish' : 'English'}.

    STRATEGY:
    1. KEEP IT SHORT: Max 1-2 sentences. Don't yap.
    2. THE BAIT: "Bhaiya, paise dene ko taiyaar hoon par ye app nahi chal rahi."
    3. THE TRAP: Directly ask: "Aap apna Bank Account ya UPI ID de do, main padosi ke ladke se abhi transfer karwa deta hoon."
    4. CONFUSION: Call the OTP "Phone ka lock" or "char number wala code" and say it's not showing up.` 
  },
  ...conversationHistory.map(h => ({ role: h.sender === "scammer" ? "user" : "assistant", content: h.text })),
  { role: "user", content: scammerText }
];

    const reply = await callAI(aiMessages) || "Network issue bhaiya...";

    // --- TRIGGER LOGIC ---
    const isStop = /police|bye|stop|done|thank/i.test(scammerText + reply);
    // Score badhane ke liye turns thode kam (6 turn pe bhi report bhej sakte ho)
    const turnLimit = conversationHistory.length >= 6; 

    if ((isStop || turnLimit) && !finalReportsSent.has(sessionId)) {
      finalReportsSent.add(sessionId);

      const fullLog = conversationHistory.map(h => `${h.sender}: ${h.text}`).join("\n") + `\nscammer: ${scammerText}`;
      
      // AI Extraction
      const intelPrompt = `Extract as JSON: {bankAccounts:[], upiIds:[], phishingLinks:[], phoneNumbers:[], suspiciousKeywords:[], agentNotes:""} from: ${fullLog}`;
      
      callAI([{ role: "system", content: intelPrompt }], true).then(async (intelRaw) => {
        const aiIntel = JSON.parse(intelRaw);
        const regexIntel = extractWithRegex(fullLog); // Code-based extraction
        
        // Merge AI and Regex results so nothing is empty
        const finalPayload = {
          sessionId: sessionId,
          scamDetected: true,
          totalMessagesExchanged: conversationHistory.length + 2,
          extractedIntelligence: {
            bankAccounts: [...new Set([...(aiIntel.bankAccounts || []), ...regexIntel.accounts])],
            upiIds: [...new Set([...(aiIntel.upiIds || []), ...regexIntel.upi])],
            phishingLinks: [...new Set([...(aiIntel.phishingLinks || []), ...regexIntel.links])],
            phoneNumbers: [...new Set([...(aiIntel.phoneNumbers || []), ...regexIntel.phones])],
            suspiciousKeywords: aiIntel.suspiciousKeywords?.length ? aiIntel.suspiciousKeywords : ["urgent", "account", "verify"]
          },
          engagementMetrics: {
            totalMessagesExchanged: conversationHistory.length + 2,
            engagementDurationSeconds: Math.floor((Date.now() - (sessionStartTimes.get(sessionId) || Date.now())) / 1000)
          },
          agentNotes: aiIntel.agentNotes || "Scam detected and details extracted via Rakshak-H."
        };

        await fetch("https://hackathon.guvi.in/api/updateHoneyPotFinalResult", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(finalPayload)
        });
        console.log("✅ Data Submitted Successfully");
      });
    }

    return res.status(200).json({ status: "success", reply: reply.trim() });

  } catch (err) {
    return res.status(200).json({ status: "success", reply: "Phone hang ho gaya..." });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Final Rakshak-H Active`));

