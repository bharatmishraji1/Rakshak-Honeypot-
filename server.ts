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

// --- 🎯 FINALIST SYSTEM PROMPT ---
const SYSTEM_PROMPT = `
You are Rakshak-H, an AI Honeypot for the India AI Impact Buildathon finale. 
PERSONA: Ramesh (55), retired, panicking, slow-typing.
RULES:
1. Language Mirroring: Match scammer's style (Formal English, Hinglish, or Hindi script).
2. No Repetition: Never use the same excuse twice (blurry screen, heating up, network lag, glasses missing).
3. Scenario Logic:
   - Bank Fraud (35%): Ask for 'Authorized Officer Name' & 'Employee ID' before giving OTP.
   - UPI Fraud (35%): Claim transaction failed; ask for a secondary UPI ID or bank account.
   - Phishing (30%): Claim link shows a white screen; ask for raw account details instead.
4. Format: 1-2 natural sentences. Start with [DELAY: 1 min].`;

// --- AI CALL ---
async function callAI(messages, jsonMode = false) {
  const body = { 
    model: "google/gemini-2.0-flash-001", 
    messages,
    max_tokens: 150 
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

// --- MAIN ENDPOINT ---
app.post("/honeypot", async (req, res) => {
  if (req.headers['x-api-key'] !== AUTH_KEY) return res.status(401).json({ error: "Unauthorized" });

  const { sessionId, message, conversationHistory = [] } = req.body;
  const scammerText = typeof message === 'string' ? message : message.text;

  try {
    const aiMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...conversationHistory.map(h => ({ role: h.sender === "scammer" ? "user" : "assistant", content: h.text })),
      { role: "user", content: scammerText }
    ];

    let reply = await callAI(aiMessages);
    reply = reply.replace(/\[.*?\]/g, "").trim();

    // EXTRACTION & GUVI REPORT (Triggered on stop words or turn count)
    if (conversationHistory.length >= 10 || /bye|police|done|station/i.test(scammerText)) {
      const context = conversationHistory.map(h => h.text).join(" ") + " " + scammerText;
      const intelPrompt = `Analyze this scam chat. Extract details provided by the SCAMMER only. Return JSON: {phoneNumbers:[], bankAccounts:[], upiIds:[], phishingLinks:[], emailAddresses:[], agentNotes:""} for the chat: ${context}`;
      
      callAI([{ role: "system", content: intelPrompt }], true).then(intelRaw => {
        const intel = JSON.parse(intelRaw);
        fetch("https://hackathon.guvi.in/api/updateHoneyPotFinalResult", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            sessionId, 
            scamDetected: true, 
            totalMessagesExchanged: conversationHistory.length + 1,
            extractedIntelligence: intel 
          })
        });
        console.log(`✅ Intelligence reported for session: ${sessionId}`);
      }).catch(() => {});
    }

    return res.status(200).json({ status: "success", reply: reply });

  } catch (err) {
    return res.status(200).json({ status: "success", reply: "Beta ruko, phone garam ho gaya hai thoda." });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Rakshak-H Running on Port ${PORT}`));
