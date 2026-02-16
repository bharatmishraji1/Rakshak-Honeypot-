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

// Global stores for scoring metrics
const sessionStartTimes = new Map();
const finalReportsSent = new Set();

// --- AI ENGINE ---
async function callAI(messages, jsonMode = false) {
  const body = { 
    model: "google/gemini-2.0-flash-001", 
    messages,
    max_tokens: 400,
    temperature: 0.8 
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

// --- HONEYPOT ENDPOINT ---
app.post("/honeypot", async (req, res) => {
  // 1. Authenticate Request
  if (req.headers['x-api-key'] !== AUTH_KEY) {
    return res.status(401).json({ status: "error", message: "Invalid API key" });
  }

  const { sessionId, message, conversationHistory = [] } = req.body;
  const scammerText = typeof message === 'string' ? message : message.text;

  // Initialize session timer for Engagement Quality score
  if (!sessionStartTimes.has(sessionId)) {
    sessionStartTimes.set(sessionId, Date.now());
  }

  try {
    // 2. Language & Persona Logic
    const isHinglish = /[\u0900-\u097F]|bhaiya|ruko|nahi|theek|acha|kya|hai/i.test(scammerText);
    const targetLang = isHinglish ? "Hinglish (Hindi-English mix)" : "Strict Casual English";

    const aiMessages = [
      { 
        role: "system", 
        content: `You are Rakshak-H. MIRROR the scammer's language: ${targetLang}.
        Persona: Ramesh, a retired clerk. You are confused and slow but very eager to help.
        Strategy: When they ask for OTP or a link click, make a believable technical excuse (screen is blurry, app is updating). 
        This forces the scammer to manually provide their Phone Number, UPI ID, or Bank Account to help you.` 
      },
      ...conversationHistory.map(h => ({ role: h.sender === "scammer" ? "user" : "assistant", content: h.text })),
      { role: "user", content: scammerText }
    ];

    const reply = await callAI(aiMessages);

    // 3. FINAL OUTPUT SUBMISSION LOGIC (Section 5 Compliance)
    const isStopRequested = /police|bye|stop|done|thank|blocked/i.test(scammerText + reply);
    const turnLimit = conversationHistory.length >= 16; // Typically triggers at Turn 8 or 9

    if ((isStopRequested || turnLimit) && !finalReportsSent.has(sessionId)) {
      finalReportsSent.add(sessionId);

      const fullChatLog = conversationHistory.map(h => `${h.sender}: ${h.text}`).join("\n") + `\nscammer: ${scammerText}`;

      const intelPrompt = `Analyze the following chat log. Extract all details provided by the scammer.
      Return ONLY a JSON object:
      {
        "bankAccounts": [],
        "upiIds": [],
        "phishingLinks": [],
        "phoneNumbers": [],
        "emailAddresses": [],
        "suspiciousKeywords": [],
        "agentNotes": "Brief summary"
      }
      Chat Log:
      ${fullChatLog}`;

      // Async background extraction to not delay the response
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
            suspiciousKeywords: intel.suspiciousKeywords || []
          },
          engagementMetrics: {
            totalMessagesExchanged: conversationHistory.length + 2,
            engagementDurationSeconds: Math.floor((Date.now() - startTime) / 1000)
          },
          agentNotes: intel.agentNotes || "Scammer engaged via Rakshak-H. Details extracted."
        };

        // MANDATORY: Post to GUVI Evaluation Endpoint
        await fetch("https://hackathon.guvi.in/api/updateHoneyPotFinalResult", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(finalPayload)
        });
        console.log(`✅ Final Callback Sent for ${sessionId}`);
      }).catch(err => console.error("Extraction Error:", err));
    }

    // 4. REQUIRED RESPONSE FORMAT (Section 4 Compliance)
    return res.status(200).json({
      status: "success",
      reply: reply.trim()
    });

  } catch (err) {
    // Fail-safe response
    return res.status(200).json({ 
      status: "success", 
      reply: "Sorry, my phone is acting very strange. One moment." 
    });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Rakshak-H: Full Evaluation Ready on Port ${PORT}`));

