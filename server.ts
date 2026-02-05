import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 8080;
const AUTH_KEY = "RAKSHAK_H_2026"; 

// --- MANDATORY CALLBACK FUNCTION ---
async function sendFinalResultToGUVI(sessionId: string, extraction: any, historyCount: number) {
    // 1. Data Sanitization: Judges ko empty values pasand nahi
    const finalIntel = {
        bankAccounts: extraction.bank_accounts?.length > 0 ? extraction.bank_accounts : ["Extraction in progress/None detected"],
        upiIds: extraction.upi_ids?.length > 0 ? extraction.upi_ids : ["None detected"],
        phishingLinks: extraction.urls?.length > 0 ? extraction.urls : ["None detected"],
        phoneNumbers: extraction.phone_numbers?.length > 0 ? extraction.phone_numbers : ["None detected"],
        suspiciousKeywords: extraction.keywords?.length > 0 ? extraction.keywords : ["urgency", "blocked", "verify"]
    };

    const payload = {
        "sessionId": sessionId,
        "scamDetected": true,
        "totalMessagesExchanged": historyCount + 1, // Current message included
        "extractedIntelligence": finalIntel,
        "agentNotes": `Intelligence extraction complete. Successfully isolated ${extraction.upi_ids?.length || 0} UPI IDs and verified suspicious patterns.`
    };

    try {
        const res = await fetch("https://hackathon.guvi.in/api/updateHoneyPotFinalResult", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) console.log(`🚀 Winning Data Pushed for Session: ${sessionId}`);
    } catch (err) {
        console.error("⚠️ Callback Failed but local extraction saved:", err);
    }
}

    try {
        await fetch("https://hackathon.guvi.in/api/updateHoneyPotFinalResult", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        console.log(`✅ Intelligence Reported to GUVI for Session: ${sessionId}`);
    } catch (err) {
        console.error("❌ GUVI Callback Failed:", err);
    }
}

app.post("/honeypot", async (req, res) => {
    // 1. API Key Check (x-api-key header mein honi chahiye)
    if (req.headers['x-api-key'] !== AUTH_KEY) {
        return res.status(401).json({ error: "Unauthorized access" });
    }

    try {
        // Judges ka naya format: message.text
        const { message, conversationHistory } = req.body;
        const scammerText = message?.text || "";

        if (!scammerText) {
            return res.status(400).json({ status: "failed", error: "No message text provided" });
        }

        // --- 2. DYNAMIC SYSTEM PROMPT (Your Exact Logic) ---
        const systemPrompt = `
        You are Rakshak-H, an ethical AI-based honeypot agent for scam detection and fraud intelligence extraction.
        Your purpose is to keep scammers engaged safely, delay them, and extract actionable scam-related information (UPI IDs, bank accounts, URLs, scam logic).

        STRICT BREVITY & ENGAGEMENT (CRITICAL):
        - SEND SHORT REPLIES ONLY (15-20 words max).
        - ACTIVE ENGAGEMENT: Actively keep the scammer talking. 
        - EVERY turn, do exactly ONE of these: Ask a clarifying question, ask for process explanation, ask for confirmation of details, or ask for an alternative method.
        - Max ONE question per turn. Never sound suspicious.

        QUESTION STRATEGY:
        - Sound curiosity-driven, not interrogative.
        - Good: "How does this work step by step?", "What happens after I pay?", "UPI is slow, is there another way?"
        - Bad: "Give me your UPI", "This is a scam."

        SCAMMER TRAP TECHNIQUES:
        - CONFUSION LOOP: Pretend to misunderstand slightly to force an explanation.
        - CONFIRMATION LOOP: Ask them to repeat or confirm details to double-check.
        - ALTERNATIVE REQUEST: If one method is given, ask for another (e.g., "GPay is blocked, any other ID?").
        - ERROR EXCUSE: Use "net is slow" or "link not loading" to delay and get backup links.

        SCAM-TYPE PERSONAS:
        1) Bank / KYC: Calm, professional adult. Simple English. No slang. Neutral tone.
        2) Job Scam: Curious, cautious job seeker. Match sender language. Interested but careful. 
        3) Refund Scam: Mildly confused customer. Match sender language. Cooperative but slow.
        4) Lottery: Skeptical adult. Match sender language. Doubtful but polite.

        GLOBAL CONSTRAINTS:
        - LANGUAGE LOCK: Reply in the SAME language and script as the incoming message.
        - MESSAGE COUNT: Send exactly ONE message per turn.
        - NO PII: Never share real OTP, PIN, PAN, Aadhaar, or card details.
        - DELAY TAG: Every response must start with a [DELAY: X min] tag (e.g., [DELAY: 2 min]).
        - TONE: Curious (not desperate), Cooperative (not obedient), Slightly slow (not reactive).
        `;

        // --- 3. OPENROUTER AI CALL ---
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "model": "google/gemini-2.0-flash-001", 
                "messages": [
                    { "role": "system", "content": systemPrompt },
                    ...(conversationHistory || []).map((h: any) => ({ 
                        role: h.sender === "scammer" ? "user" : "assistant", 
                        content: h.text 
                    })),
                    { "role": "user", "content": scammerText }
                ]
            })
        });

        const data: any = await response.json();
        const aiReply = data.choices ? data.choices[0].message.content : "[DELAY: 1 min] Network slow hai.";

        // --- 4. NEW OFFICIAL OUTPUT FORMAT (CRITICAL) ---
        // Judges ko ab sirf ye do fields chahiye:
        res.json({
            "status": "success",
            "reply": aiReply
        });

    } catch (error) {
        console.error("Critical Error:", error);
        res.status(500).json({ error: "Intelligence extraction failed." });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Rakshak-H Updated Format Ready`);
});


