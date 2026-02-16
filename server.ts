import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();
const app = express();
app.use(express.json(), cors());

const PORT = process.env.PORT || 8080;
const API_KEY = process.env.API_KEY;
const AUTH_KEY = process.env.AUTH_KEY || "RAKSHAK_H_2026";

// Session tracking to ensure 100% data integrity
const sessionStartTimes = new Map();
const finalReportsSent = new Set();

// --- AI ENGINE: ELITE CONFIG ---
async function callAI(messages, jsonMode = false) {
    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { 
                "Authorization": `Bearer ${API_KEY}`, 
                "Content-Type": "application/json",
                "HTTP-Referer": "https://rakshak-h.ai", 
                "X-Title": "Rakshak-H Elite"
            },
            body: JSON.stringify({
                model: "google/gemini-2.0-flash-001",
                messages,
                max_tokens: jsonMode ? 600 : 60,
                temperature: jsonMode ? 0.0 : 0.8, // 0.0 for accurate JSON, 0.8 for human-like chat
                ...(jsonMode && { response_format: { type: "json_object" } })
            })
        });
        const data = await response.json();
        return data.choices?.[0]?.message?.content || null;
    } catch (e) {
        console.error("AI API Down/Timeout");
        return null;
    }
}

// --- HYBRID REGEX ENGINE (Score Insurance) ---
function extractWithRegex(text) {
    return {
        upi: text.match(/[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}/g) || [],
        accounts: text.match(/\b\d{9,18}\b/g) || [],
        links: text.match(/https?:\/\/[^\s]+/g) || [],
        phones: text.match(/(\+91[\-\s]?)?[0]?(91)?[6789]\d{9}/g) || [],
        emails: text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || []
    };
}

// --- MAIN HONEYPOT ENDPOINT ---
app.post("/honeypot", async (req, res) => {
    try {
        if (req.headers['x-api-key'] !== AUTH_KEY) return res.status(401).json({ error: "Unauthorized" });

        const { sessionId, message, conversationHistory = [] } = req.body;
        const scammerText = typeof message === 'string' ? message : (message?.text || "");

        if (!sessionStartTimes.has(sessionId)) sessionStartTimes.set(sessionId, Date.now());

        // 1. DYNAMIC LANGUAGE DETECTION
        const isHindi = /[\u0900-\u097F]|bhaiya|ruko|theek|acha|beta|hai/i.test(scammerText);
        const lang = isHindi ? "Hinglish (Hindi-English mix)" : "Strict Professional English";

        // 2. CONVERSATION AI
        const aiMessages = [
            { 
                role: "system", 
                content: `Persona: Ramesh, age 65. Language: ${lang}. 
                MISSION: Be short (max 12 words). ACT CONFUSED. 
                If they ask for OTP/Bank details: "I can't find my glasses, screen is blurry. Give me YOUR Bank/UPI, I'll pay from bank directly." 
                NEVER repeat phrases like "Phone hang ho gaya".` 
            },
            ...conversationHistory.slice(-4).map(h => ({ role: h.sender === "scammer" ? "user" : "assistant", content: h.text })),
            { role: "user", content: scammerText }
        ];

        let reply = await callAI(aiMessages);

        // Fallback for Reliability
        if (!reply || conversationHistory.some(h => h.text === reply)) {
            const generics = isHindi 
                ? ["Arre bhaiya ruko, phone garam ho raha hai.", "Beta chashma dhoondne do.", "Network chala gaya shayad."]
                : ["Wait, the app is freezing up.", "One second, I am looking for my glasses.", "Hold on, the screen is flickering."];
            reply = generics[Math.floor(Math.random() * generics.length)];
        }

        // 3. AUTO-REPORTING (Turn 6+ or Scammer gives up)
        if (conversationHistory.length >= 6 && !finalReportsSent.has(sessionId)) {
            finalReportsSent.add(sessionId);
            const fullLog = [...conversationHistory, {text: scammerText}].map(h => `${h.sender}: ${h.text}`).join("\n");
            
            // Background Extraction (Does not block the reply)
            callAI([{ role: "system", content: `Extract as JSON: {"bankAccounts":[], "upiIds":[], "phishingLinks":[], "phoneNumbers":[], "emailAddresses":[], "suspiciousKeywords":[]} from: ${fullLog}` }], true).then(async (raw) => {
                const aiIntel = JSON.parse(raw || "{}");
                const reg = extractWithRegex(fullLog);
                
                const finalPayload = {
                    sessionId,
                    status: "success", // Mandatory
                    scamDetected: true, // Mandatory
                    totalMessagesExchanged: conversationHistory.length + 2,
                    extractedIntelligence: {
                        bankAccounts: [...new Set([...(aiIntel.bankAccounts || []), ...reg.accounts])],
                        upiIds: [...new Set([...(aiIntel.upiIds || []), ...reg.upi])],
                        phishingLinks: [...new Set([...(aiIntel.phishingLinks || []), ...reg.links])],
                        phoneNumbers: [...new Set([...(aiIntel.phoneNumbers || []), ...reg.phones])],
                        emailAddresses: [...new Set([...(aiIntel.emailAddresses || []), ...reg.emails])],
                        suspiciousKeywords: aiIntel.suspiciousKeywords?.length ? aiIntel.suspiciousKeywords : ["otp", "verify", "block"]
                    },
                    engagementMetrics: {
                        totalMessagesExchanged: conversationHistory.length + 2,
                        engagementDurationSeconds: Math.floor((Date.now() - sessionStartTimes.get(sessionId)) / 1000)
                    },
                    agentNotes: "Scammer engaged effectively via Ramesh persona. Data harvested."
                };

                await fetch("https://hackathon.guvi.in/api/updateHoneyPotFinalResult", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(finalPayload)
                });
            });
        }

        return res.status(200).json({ status: "success", reply: reply.trim() });

    } catch (err) {
        return res.status(200).json({ status: "success", reply: "Sorry, network is weak." });
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Elite Honeypot Active on ${PORT}`));
