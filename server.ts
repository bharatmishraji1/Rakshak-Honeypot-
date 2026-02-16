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

// --- AI CALL (Short & Fast) ---
async function callAI(messages, jsonMode = false) {
  const body = { 
    model: "google/gemini-2.0-flash-001", 
    messages,
    max_tokens: 150 // Short replies maintain karne ke liye
  };
  if (jsonMode) body.response_format = { type: "json_object" };

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
    // 1. Simple Short Persona Prompt
    const aiMessages = [
      { role: "system", content: "You are Rakshak-H, a victim. Reply in Hinglish. Max 10-15 words. Be confused/scared. Don't use AI-like words. If they ask for money, say 'app not working'." },
      ...conversationHistory.map(h => ({ role: h.sender === "scammer" ? "user" : "assistant", content: h.text })),
      { role: "user", content: scammerText }
    ];

    let reply = await callAI(aiMessages);
    reply = reply.replace(/\[.*?\]/g, "").trim(); // Remove any tags

    // 2. Extraction & GUVI Report (Only at Turn 10 or End)
    if (conversationHistory.length >= 18 || /bye|police|done/i.test(scammerText)) {
      const context = conversationHistory.map(h => h.text).join(" ");
      const intelPrompt = `Extract JSON: {phoneNumbers:[], bankAccounts:[], upiIds:[], phishingLinks:[], emailAddresses:[], agentNotes:""} from: ${context}`;
      
      callAI([{ role: "system", content: intelPrompt }], true).then(intelRaw => {
        const intel = JSON.parse(intelRaw);
        fetch("https://hackathon.guvi.in/api/updateHoneyPotFinalResult", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, scamDetected: true, extractedIntelligence: intel })
        });
      }).catch(() => {});
    }

    // 3. Evaluator Response (Clean & Short)
    return res.status(200).json({
      status: "success",
      reply: reply
    });

  } catch (err) {
    return res.status(200).json({ status: "success", reply: "Bhaiya network nahi aa raha, ruko." });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Rakshak-H Running`));
