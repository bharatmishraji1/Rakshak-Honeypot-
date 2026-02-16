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

// Global tracking
const sessionStartTimes = new Map();
const finalReportsSent = new Set();

// --- AI ENGINE ---
async function callAI(messages, jsonMode = false) {
  const body = { 
    model: "google/gemini-2.0-flash-001", 
    messages,
    max_tokens: 500, // Increased for better extraction
    temperature: 0.7 
  };
  if (jsonMode) body.response_format = { type: "json_object" };

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    return data.choices[0].message.content;
  } catch (e) {
    console.error("AI Error:", e);
    return null;
  }
}

// --- HONEYPOT ENDPOINT ---
app.post("/honeypot", async (req, res) => {
  if (req.headers['x-api-key'] !== AUTH_KEY) {
    return res.status(401).json({ status: "error", message: "Unauthorized" });
  }

  const { sessionId, message, conversationHistory = [] } = req.body;
  const scammerText = typeof message === 'string' ? message : message.text;

  if (!sessionStartTimes.has(sessionId)) {
    sessionStartTimes.set(sessionId, Date.now());
  }

  try {
    // 1. Language Detection & Reply
    const isHinglish = /[\u0900-\u097F]|bhaiya|ruko|nahi|theek|acha|kya|hai/i.test(scammerText);
    const targetLang = isHinglish ? "Hinglish (Mix of Hindi/English)" : "strict casual English";

    const aiMessages = [
      { 
        role: "system", 
        content: `You are Rakshak-H, a smart honeypot. Mirror the scammer's language (${targetLang}).
        Persona: Retired clerk Ramesh. Curious but tech-confused.
        MISSION: Extract UPI, Bank details, or Phishing Links.
        RULE: If they ask for OTP, say "Mobile screen is cracked, can't read it. Send me your ID or account so I can check manually."` 
      },
      ...conversationHistory.map(h => ({ role: h.sender === "scammer" ? "user" : "assistant", content: h.text })),
      { role: "user", content: scammerText }
    ];

    const reply = await callAI(aiMessages) || "Wait brother, network issue...";

    // 2. INTELLIGENCE EXTRACTION TRIGGER (The fix for your "Black" empty arrays)
    // Trigger logic: If exit keywords found OR history has more than 5 messages
    const isStopRequested = /police|bye|stop|done|thank|blocked/i.test(scammerText + reply);
    const turnLimitReached = conversationHistory.length >= 10; 

    if ((isStopRequested || turnLimitReached) && !finalReportsSent.has(sessionId)) {
      finalReportsSent.add(sessionId);

      // We send the ENTIRE log to make sure we catch early Turn details
      const fullChatLog = conversationHistory.map(h => `${h.sender}: ${h.text}`).join("\n") + `\nscammer: ${scammerText}`;

      const intelPrompt = `TASK: Forensic Scam Analysis. Extract all planted fake data.
      Return ONLY a JSON object with this exact structure:
      {
        "bankAccounts": [],
        "upiIds": [],
        "phishingLinks": [],
        "phoneNumbers": [],
        "emailAddresses": [],
        "suspiciousKeywords": [],
        "agentNotes": ""
      }
      If no data found for a field, return empty array.
      Chat Log:
      ${fullChatLog}`;

      callAI([{ role: "system", content: intelPrompt }], true).then(async (intelRaw) => {
        const intel = JSON.parse(intelRaw);
        const startTime = sessionStartTimes.get(sessionId) || Date.now();
        
        const finalPayload = {
          sessionId: sessionId,
          scamDetected: true,
          totalMessagesExchanged: conversationHistory.length + 2,
          extractedIntelligence: {
            bankAccounts: intel.bankAccounts || [],
            upiIds: intel.upiIds || [],
            phishingLinks: intel.phishingLinks || [],
            phoneNumbers: intel.phoneNumbers || [],
            emailAddresses: intel.emailAddresses || [],
            suspiciousKeywords: intel.suspiciousKeywords || ["urgent", "account"]
          },
          engagementMetrics: {
            totalMessagesExchanged: conversationHistory.length + 2,
            engagementDurationSeconds: Math.floor((Date.now() - startTime) / 1000)
          },
          agentNotes: intel.agentNotes || "Extracted details from scam conversation."
        };

        // Posting to GUVI Callback
        await fetch("https://hackathon.guvi.in/api/updateHoneyPotFinalResult", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(finalPayload)
        }).catch(e => console.error("Callback Error:", e));

        console.log(`✅ Final Data Submitted for session: ${sessionId}`);
      }).catch(e => console.error("JSON Parse Error:", e));
    }

    // 3. MANDATORY RESPONSE
    return res.status(200).json({
      status: "success",
      reply: reply.trim()
    });

  } catch (err) {
    return res.status(200).json({ status: "success", reply: "Bhaiya ruko, phone hang ho raha hai." });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Rakshak-H Optimized on Port ${PORT}`));
