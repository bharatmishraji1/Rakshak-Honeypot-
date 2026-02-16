import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch'; // Ensure node-fetch is installed or use global fetch in Node 18+

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
    try {
        const body = {
            model: "google/gemini-2.0-flash-001",
            messages: messages,
            max_tokens: jsonMode ? 500 : 100, // Extra tokens for extraction
            temperature: jsonMode ? 0.3 : 0.7 
        };
        if (jsonMode) body.response_format = { type: "json_object" };

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { 
                "Authorization": `Bearer ${API_KEY}`, 
                "Content-Type": "application/json" 
            },
            body: JSON.stringify(body)
        });
        const data = await response.json();
        return data.choices[0].message.content;
    } catch (e) {
        console.error("AI Error:", e);
        return null;
    }
}

// --- HELPER: REGEX EXTRACTION ---
function extractWithRegex(text) {
    return {
        upi: text.match(/[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}/g) || [],
        accounts: text.match(/\b\d{9,18}\b/g) || [],
        links: text.match(/https?:\/\/[^\s]+/g) || [],
        phones: text.match(/(\+91[\-\s]?)?[0]?(91)?[6789]\d{9}/g) || [],
        ifsc: text.match(/[A-Z]{4}0[A-Z0-9]{6}/g) || [],
        emails: text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || []
    };
}

// --- HONEYPOT ENDPOINT ---
app.post("/honeypot", async (req, res) => {
    try {
        if (req.headers['x-api-key'] !== AUTH_KEY) return res.status(401).send("Unauthorized");

        const { sessionId, message, conversationHistory = [] } = req.body;
        const scammerText = typeof message === 'string' ? message : (message?.text || "");

        if (!sessionStartTimes.has(sessionId)) sessionStartTimes.set(sessionId, Date.now());

        // 1. Language Detection
        const containsHindi = /[\u0900-\u097F]|bhaiya|ruko|theek|acha|kya|hai|beta/i.test(scammerText);
        const selectedLang = containsHindi ? "Hinglish (Hindi-English mix)" : "Strict Formal English";

        // 2. Persona Prompt
        const aiMessages = [
            {
                role: "system",
                content: `You are Rakshak-H. Persona: Retired Ramesh. 
                Respond ONLY in ${selectedLang}. 
                Strategy: Act tech-confused. If they ask for OTP or Account details, say you can't read the screen and ask for THEIR Bank Account or UPI ID so you can go to the bank and pay manually.`
            },
            ...conversationHistory.map(h => ({
                role: h.sender === "scammer" ? "user" : "assistant",
                content: h.text
            })),
            { role: "user", content: scammerText }
        ];

        // 3. Get Reply
        let reply = await callAI(aiMessages);

        // Fallback Logic if AI fails
        if (!reply) {
            const fallbacks = containsHindi 
                ? ["Bhaiya ruko, phone hang ho raha hai...", "Screen thik se dikh nahi rahi.", "Ek minute, chashma dhoond raha hoon."]
                : ["One second, my phone is acting strange...", "Wait, the screen is flickering.", "I am trying to find the SMS folder."];
            reply = fallbacks[Math.floor(Math.random() * fallbacks.length)];
        }

        // 4. Trigger Reporting (Turn 6 or Keywords)
        const isStop = /police|bye|stop|done|thank|blocked/i.test(scammerText + reply);
        const turnLimit = conversationHistory.length >= 6;

        if ((isStop || turnLimit) && !finalReportsSent.has(sessionId)) {
            finalReportsSent.add(sessionId);

            const fullLog = conversationHistory.map(h => `${h.sender}: ${h.text}`).join("\n") + `\nscammer: ${scammerText}`;
            const intelPrompt = `Extract as JSON: {"bankAccounts":[], "upiIds":[], "phishingLinks":[], "phoneNumbers":[], "emailAddresses":[], "suspiciousKeywords":[], "agentNotes":""} from this chat: ${fullLog}`;

            callAI([{ role: "system", content: intelPrompt }], true).then(async (intelRaw) => {
                try {
                    const aiIntel = JSON.parse(intelRaw || "{}");
                    const regexIntel = extractWithRegex(fullLog);

                    const finalPayload = {
                        sessionId: sessionId,
                        status: "success",
                        scamDetected: true,
                        totalMessagesExchanged: conversationHistory.length + 2,
                        extractedIntelligence: {
                            bankAccounts: [...new Set([...(aiIntel.bankAccounts || []), ...regexIntel.accounts])],
                            upiIds: [...new Set([...(aiIntel.upiIds || []), ...regexIntel.upi])],
                            phishingLinks: [...new Set([...(aiIntel.phishingLinks || []), ...regexIntel.links])],
                            phoneNumbers: [...new Set([...(aiIntel.phoneNumbers || []), ...regexIntel.phones])],
                            emailAddresses: [...new Set([...(aiIntel.emailAddresses || []), ...regexIntel.emails])],
                            suspiciousKeywords: aiIntel.suspiciousKeywords?.length ? aiIntel.suspiciousKeywords : ["urgent", "verify", "account"]
                        },
                        engagementMetrics: {
                            totalMessagesExchanged: conversationHistory.length + 2,
                            engagementDurationSeconds: Math.floor((Date.now() - (sessionStartTimes.get(sessionId) || Date.now())) / 1000)
                        },
                        agentNotes: aiIntel.agentNotes || "Scam detected via Rakshak-H agent."
                    };

                    await fetch("https://hackathon.guvi.in/api/updateHoneyPotFinalResult", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(finalPayload)
                    });
                    console.log(`✅ Final Report Sent for ${sessionId}`);
                } catch (err) {
                    console.error("Payload Error:", err);
                }
            });
        }

        return res.status(200).json({ status: "success", reply: reply.trim() });

    } catch (err) {
        console.error("Server Error:", err);
        return res.status(200).json({ status: "success", reply: "Sorry, network issue." });
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Rakshak-H Live on Port ${PORT}`));
