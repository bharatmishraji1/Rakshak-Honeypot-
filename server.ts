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

// Track sessions to ensure final callback is sent once per session
const processedFinalSessions = new Set();

/**
 * AI CALL ENGINE
 * Optimized max_tokens to keep replies natural but concise as requested.
 */
async function callAI(messages, jsonMode = false) {
  const body = { 
    model: "google/gemini-2.0-flash-001", 
    messages,
    max_tokens: 300, 
    temperature: 0.8 // Higher temperature for varied, non-repetitive excuses
  };
  if (jsonMode) body.response_format = { type: "json_object" };

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  
  if (!response.ok) throw new Error("AI Service Unavailable");
  const data = await response.json();
  return data.choices[0].message.content;
}

// --- MAIN HONEYPOT API ---
app.post("/honeypot", async (req, res) => {
  // 1. Mandatory API Key Validation
  if (req.headers['x-api-key'] !== AUTH_KEY) {
    return res.status(401).json({ status: "error", message: "Unauthorized" });
  }

  const { sessionId, message, conversationHistory = [] } = req.body;
  if (!sessionId || !message) {
    return res.status(400).json({ status: "error", message: "Malformed request" });
  }

  const scammerText = typeof message === 'string' ? message : message.text;

  try {
    // 2. Persona & Interaction Logic
    const aiMessages = [
      { 
        role: "system", 
        content: `You are Rakshak-H, an autonomous AI Agent honeypot.
        MISSION: Maintain a believable human persona to extract scammer info.
        PERSONA: You are Ramesh, a retired clerk. You are interested but technologically confused and slow. 
        RULES:
        1. LANGUAGE MIRRORING: Strictly match the scammer's language. If they use English, you use English. If they use Hinglish (Hindi+English), you use Hinglish.
        2. SMART EXTRACTION: Bait the scammer for their UPI ID, Bank details, or Phishing links. If they ask for OTP, ask for their "Employee ID" or "Verification Dept Name" first.
        3. ANTI-REPETITION: Never use the same roadblock twice. Be creative: 'App is updating', 'Screen is cracked', 'Low battery', 'Forgot my glasses'.
        4. TONE: 1-3 sentences. Sound worried and eager to help, but incompetent at following technical steps.` 
      },
      ...conversationHistory.map(h => ({ 
        role: h.sender === "scammer" ? "user" : "assistant", 
        content: h.text 
      })),
      { role: "user", content: scammerText }
    ];

    const reply = await callAI(aiMessages);

    // 3. Mandatory Final Result Callback Logic
    const turnLimit = conversationHistory.length >= 16; // Engagement depth
    const scammerLeft = /bye|stop|thank|blocked|done/i.test(scammerText + reply);

    if ((turnLimit || scammerLeft) && !processedFinalSessions.has(sessionId)) {
      processedFinalSessions.add(sessionId);

      const fullChat = conversationHistory.map(h => `${h.sender}: ${h.text}`).join("\n") + `\nScammer: ${scammerText}`;
      
      const intelPrompt = `Analyze this chat for intelligence extraction. 
      Return JSON with this structure:
      {
        "bankAccounts": [],
        "upiIds": [],
        "phishingLinks": [],
        "phoneNumbers": [],
        "suspiciousKeywords": [],
        "agentNotes": ""
      }
      Chat: ${fullChat}`;

      // Background Intelligence Extraction & Reporting
      callAI([{ role: "system", content: intelPrompt }], true).then(async (intelRaw) => {
        const intel = JSON.parse(intelRaw);
        
        const payload = {
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

        // Submit to GUVI Endpoint
        await fetch("https://hackathon.guvi.in/api/updateHoneyPotFinalResult", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        console.log(`✅ Final Intelligence submitted for ${sessionId}`);
      }).catch(e => console.error("Extraction Failed:", e));
    }

    // 4. Standard Response Format
    return res.status(200).json({
      status: "success",
      reply: reply.trim()
    });

  } catch (err) {
    return res.status(200).json({ 
      status: "success", 
      reply: "Wait bhaiya, my phone is acting very slow today. Let me try again." 
    });
  }
});

// Health check
app.get("/health", (req, res) => res.json({ status: "ok" }));

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Rakshak-H: Agentic Honeypot Active on Port ${PORT}`));
