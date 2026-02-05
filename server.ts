import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 8080;
const AUTH_KEY = "RAKSHAK_H_2026"; 

async function sendFinalResultToGUVI(sessionId: string, extraction: any, historyCount: number) {
    // Ye logs tumhe Railway par dikhenge
    console.log("\n" + "=".repeat(40));
    console.log(`🚨 SCAMMER EVIDENCE FOR: ${sessionId}`);
    console.log(`UPI IDs: ${extraction.upi_ids.join(", ") || "None"}`);
    console.log(`Bank A/Cs: ${extraction.bank_accounts.join(", ") || "None"}`);
    console.log("=".repeat(40) + "\n");
    
    const payload = {
        "sessionId": sessionId,
        "scamDetected": true,
        "totalMessagesExchanged": historyCount + 1,
        "extractedIntelligence": {
            "bankAccounts": extraction.bank_accounts.length > 0 ? extraction.bank_accounts : ["None"],
            "upiIds": extraction.upi_ids.length > 0 ? extraction.upi_ids : ["None"],
            "phishingLinks": extraction.urls.length > 0 ? extraction.urls : ["None"],
            "phoneNumbers": extraction.phone_numbers.length > 0 ? extraction.phone_numbers : ["None"],
            "suspiciousKeywords": ["urgent", "verify now", "account blocked", "kyc"]
        },
        "agentNotes": "Scammer engaged using Rakshak-H persona. Forensic extraction successful."
    };

    try {
        await fetch("https://hackathon.guvi.in/api/updateHoneyPotFinalResult", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        console.log(`✅ Reported to GUVI: ${sessionId}`);
    } catch (err) {
        console.error("❌ GUVI Callback Failed");
    }
}

app.post("/honeypot", async (req, res) => {
    if (req.headers['x-api-key'] !== AUTH_KEY) {
        return res.status(401).json({ error: "Unauthorized access" });
    }

    try {
        const { sessionId, message, conversationHistory } = req.body;
        const scammerText = message?.text || "";

        // --- 1. AI REPLY LOGIC ---
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

        // --- 2. THE EXTRACTION PART (Adding this for you) ---
        const fullContext = (scammerText + " " + (conversationHistory || []).map((h: any) => h.text).join(" ")).toLowerCase();
        
        const extraction = {
            upi_ids: [...new Set(fullContext.match(/[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}/g) || [])],
            phone_numbers: [...new Set(fullContext.match(/(\+91[\-\s]?)?[0]?(91)?[6789]\d{9}/g) || [])],
            urls: [...new Set(fullContext.match(/(https?:\/\/[^\s]+)/g) || [])],
            bank_accounts: [...new Set(fullContext.match(/\b\d{9,18}\b/g) || [])]
        };

        // --- 3. TRIGGER CALLBACK IF SCAM DETECTED ---
        if (extraction.upi_ids.length > 0 || extraction.bank_accounts.length > 0 || extraction.urls.length > 0) {
            sendFinalResultToGUVI(sessionId, extraction, conversationHistory?.length || 0);
        }

        // --- 4. OFFICIAL OUTPUT FORMAT ---
        res.json({
            "status": "success",
            "reply": aiReply
        });

    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Rakshak-H Updated Format Ready`);
});
