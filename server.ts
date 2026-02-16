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

// Track sessions to avoid duplicate final reports
const finalReportsSent = new Set();

// --- AI CALL ENGINE ---
async function callAI(messages, jsonMode = false) {
  const body = { 
    model: "google/gemini-2.0-flash-001", 
    messages,
    max_tokens: 250,
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

// --- MAIN HONEYPOT API ---
app.post("/honeypot", async (req, res) => {
  if (req.headers['x-api-key'] !== AUTH_KEY) return res.status(401).json({ status: "error", message: "Unauthorized" });

  const { sessionId, message, conversationHistory = [] } = req.body;
  const scammerText = typeof message === 'string' ? message : message.text;

  // 1. Language Mirroring Detection
  const isHinglish = /[\u0900-\u097F]|bhaiya|ruko|nahi|acha|kya|hai/i.test(scammerText);
  const targetLang = isHinglish ? "Hinglish (Hindi+English mix)" : "Strict Formal English";

  try {
    const aiMessages = [
      { 
        role: "system", 
        content: `You are Rakshak-H, an AI Agent honeypot. 
        Current Context: Scammer is using ${targetLang}. 
        RULES:
        1. MIRROR LANGUAGE: You MUST use ${targetLang}. If they are formal, you be formal.
        2. PERSONA: You are Ramesh, a retired clerk. You are eager but tech-confused.
        3. EXTRACTION: If they ask for OTP/Payment, make excuses (app error, blurry screen) to force them to give their Name, UPI ID, or Bank details.
        4. ANTI-REPETITION: Never repeat the same excuse. 
        5. TONE: 1-3 natural sentences. Do not sound like a bot.` 
      },
      ...conversationHistory.map(h => ({ role: h.sender === "scammer" ? "user" : "assistant", content: h.text })),
      { role: "user", content: scammerText }
    ];

    let reply = await callAI(aiMessages);
    reply = reply.trim();

    // --- MANDATORY FINAL CALLBACK LOGIC ---
    const shouldEnd = /police|bye|stop|done|thank/i.test(scammerText + reply);
    const turnLimit = conversationHistory.length >= 16; // Engagement depth

    if ((shouldEnd || turnLimit) && !finalReportsSent.has(sessionId)) {
      finalReportsSent.add(sessionId);
      
      const intelPrompt = `Analyze the chat and return JSON ONLY:
      {
        "bankAccounts": [],
        "upiIds": [],
        "phishingLinks": [],
        "phoneNumbers": [],
        "suspiciousKeywords": [],
        "agentNotes": ""
      }
      Chat: ${conversationHistory.map(h => h.text).join(" ")} ${scammerText}`;
      
      callAI([{ role: "system", content: intelPrompt }], true).then(async (intelRaw) => {
        const intel = JSON.parse(intelRaw);
        
        // Final Payload Submission
        const finalPayload = {
          sessionId: sessionId,
          scamDetected: true,
          totalMessagesExchanged: conversationHistory.length + 2,
          extractedIntelligence: {
            bankAccounts: intel.bankAccounts || [],
            upiIds: intel.upiIds || [],
            phishingLinks: intel.phishingLinks || [],
            phoneNumbers: intel.phoneNumbers || [],
            suspiciousKeywords: intel.suspiciousKeywords || []
          },
          agentNotes: intel.agentNotes || "Scammer engaged via Rakshak-H persona."
        };

        await fetch("https://hackathon.guvi.in/api/updateHoneyPotFinalResult", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(finalPayload)
        });
        console.log(`✅ Mandatory callback sent for session ${sessionId}`);
      }).catch(e => console.error("Callback failed:", e));
    }

    // Standard Turn Response
    return res.status(200).json({
      status: "success",
      reply: reply
    });

  } catch (err) {
    const fallback = targetLang === "Strict Formal English" ? "One moment please, my screen is flickering." : "Ruko bhaiya, phone hang ho raha hai.";
    return res.status(200).json({ status: "success", reply: fallback });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Rakshak-H: Final Callback Ready`));
