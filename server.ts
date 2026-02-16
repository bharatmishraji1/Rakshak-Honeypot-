import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();
const app = express();
app.use(express.json(), cors());

const PORT = process.env.PORT || 8080;
const API_KEY = process.env.API_KEY;
const sessionStartTimes = new Map();
const finalReportsSent = new Set();

// --- AI ENGINE (Fixed Scope) ---
async function callAI(messages, jsonMode = false) {
    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "google/gemini-2.0-flash-001",
                messages,
                max_tokens: jsonMode ? 500 : 50, // Short response for chat
                temperature: jsonMode ? 0.1 : 0.9, // Creative for chat, precise for JSON
                ...(jsonMode && { response_format: { type: "json_object" } })
            })
        });
        const data = await response.json();
        return data.choices?.[0]?.message?.content || null;
    } catch (e) { return null; }
}

function extractWithRegex(text) {
    return {
        upi: text.match(/[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}/g) || [],
        accounts: text.match(/\b\d{9,18}\b/g) || [],
        links: text.match(/https?:\/\/[^\s]+/g) || [],
        phones: text.match(/(\+91[\-\s]?)?[0]?(91)?[6789]\d{9}/g) || []
    };
}

app.post("/honeypot", async (req, res) => {
    const { sessionId, message, conversationHistory = [] } = req.body;
    const scammerText = message?.text || "";
    if (!sessionStartTimes.has(sessionId)) sessionStartTimes.set(sessionId, Date.now());

    const isHindi = /[\u0900-\u097F]|bhaiya|ruko|theek|acha/i.test(scammerText);
    const lang = isHindi ? "Hinglish" : "English";

    // --- PERSONA: VERY SHORT & NATURAL ---
    const aiMessages = [
        { role: "system", content: `You are Ramesh, 65. Use ${lang}. BE BRIEF. Max 10 words. 
        Don't act like a bot. If they ask for OTP/Account, say: "I can't see the SMS, screen is blurry. Give me YOUR UPI/Account, I'll pay from bank directly."` },
        ...conversationHistory.slice(-3).map(h => ({ role: h.sender === "scammer" ? "user" : "assistant", content: h.text })),
        { role: "user", content: scammerText }
    ];

    let reply = await callAI(aiMessages);
    if (!reply) reply = isHindi ? "Arre ruko, chashma dhoond raha hoon." : "Wait, let me find my glasses.";

    // --- REPORTING LOGIC ---
    if (conversationHistory.length >= 6 && !finalReportsSent.has(sessionId)) {
        finalReportsSent.add(sessionId);
        const fullLog = [...conversationHistory, {text: scammerText}].map(h => h.text).join(" ");
        
        callAI([{ role: "system", content: `Return JSON only: {"bankAccounts":[], "upiIds":[], "phishingLinks":[], "phoneNumbers":[]} from: ${fullLog}` }], true).then(async (raw) => {
            const aiIntel = JSON.parse(raw || "{}");
            const reg = extractWithRegex(fullLog);
            
            const payload = {
                sessionId, status: "success", scamDetected: true,
                totalMessagesExchanged: conversationHistory.length + 2,
                extractedIntelligence: {
                    bankAccounts: [...new Set([...(aiIntel.bankAccounts || []), ...reg.accounts])],
                    upiIds: [...new Set([...(aiIntel.upiIds || []), ...reg.upi])],
                    phishingLinks: [...new Set([...(aiIntel.phishingLinks || []), ...reg.links])],
                    phoneNumbers: [...new Set([...(aiIntel.phoneNumbers || []), ...reg.phones])]
                },
                engagementMetrics: {
                    totalMessagesExchanged: conversationHistory.length + 2,
                    engagementDurationSeconds: Math.floor((Date.now() - sessionStartTimes.get(sessionId)) / 1000)
                }
            };
            await fetch("https://hackathon.guvi.in/api/updateHoneyPotFinalResult", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
        });
    }
    res.status(200).json({ status: "success", reply });
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Rakshak-H Live on Port ${PORT}`));
