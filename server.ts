import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 8080;
const AUTH_KEY = "RAKSHAK_H_2026"; 

app.post("/honeypot", async (req, res) => {
    // 1. Auth check
    if (req.headers['x-api-key'] !== AUTH_KEY) {
        return res.status(401).json({ error: "Unauthorized access" });
    }

    try {
        const { message, history } = req.body;
        console.log("📩 REQUEST RECEIVED: ", message);

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
                    ...(history || []).map((h: any) => ({ 
                        role: h.role === "assistant" ? "assistant" : "user", 
                        content: h.content 
                    })),
                    { "role": "user", "content": message }
                ]
            })
        });

        const data: any = await response.json();
        const aiReply = data.choices ? data.choices[0].message.content : "[DELAY: 1 min] Connection error, trying again...";

        // --- 4. EXTRACTION LOGIC ---
        // --- 3. HIGH-ACCURACY DETECTION & EXTRACTION ---
        const text = ((history || []).map((h: any) => h.content).join(" ") + " " + (message || "")).toLowerCase();
        
        let scam_type = "none";
        let confidence = 0.2;

        // SPECIFIC CATEGORY DETECTION
        if (["kyc", "blocked", "verify", "suspend", "unblock"].some(k => text.includes(k))) {
            scam_type = "kyc_scam";
            confidence = 0.92;
        } else if (["refund", "return", "cashback", "bill"].some(k => text.includes(k))) {
            scam_type = "refund_scam";
            confidence = 0.90;
        } else if (["job", "salary", "offer", "seat", "registration"].some(k => text.includes(k))) {
            scam_type = "job_scam";
            confidence = 0.88;
        } else if (["lottery", "prize", "winner", "reward"].some(k => text.includes(k))) {
            scam_type = "lottery_scam";
            confidence = 0.85;
        } else if (["upi", "payment", "account", "bank", "otp", "link"].some(k => text.includes(k))) {
            scam_type = "generic_scam";
            confidence = 0.80;
        }

        const is_scam = scam_type !== "none";

        // --- 📊 ENTITY EXTRACTION (Including Bank Account) ---
        const upi_ids = [...new Set(text.match(/[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}/g) || [])];
        const phone_numbers = [...new Set(text.match(/(\+91[\-\s]?)?[0]?(91)?[6789]\d{9}/g) || [])];
        const urls = [...new Set(text.match(/(https?:\/\/[^\s]+)/g) || [])];
        
        // 🏦 BANK ACCOUNT REGEX (9 to 18 digits)
        const bank_accounts = [...new Set(text.match(/\b\d{9,18}\b/g) || [])];

        // --- 📝 DYNAMIC SUMMARY ---
        let summary_parts = [];
        if (is_scam) summary_parts.push(`Detected ${scam_type} attempt.`);
        if (upi_ids.length > 0) summary_parts.push(`Extracted ${upi_ids.length} UPI ID(s).`);
        if (bank_accounts.length > 0) summary_parts.push(`Extracted ${bank_accounts.length} Bank Account(s).`);
        if (phone_numbers.length > 0) summary_parts.push(`Extracted ${phone_numbers.length} Phone Number(s).`);
        if (urls.length > 0) summary_parts.push(`Extracted ${urls.length} Phishing URL(s).`);
        
        const final_summary = summary_parts.length > 0 ? summary_parts.join(" ") : "No significant scam indicators detected.";

        // --- 4. HACKATHON OUTPUT ---
        res.json({
            "scam_detected": is_scam,
            "scam_type": is_scam ? scam_type : "normal_conversation",
            "confidence_score": is_scam ? confidence : 0.1,
            "agent_response": aiReply,
            "extracted_entities": {
                "upi_ids": upi_ids,
                "bank_accounts": bank_accounts, // Ab ye bank account bhi dega!
                "phone_numbers": phone_numbers,
                "urls": urls
            },
            "conversation_summary": final_summary
        });
    } catch (error) {
        console.error("Critical Error:", error);
        res.status(500).json({ error: "Intelligence extraction failed." });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Rakshak-H Ready on Port ${PORT}`);
});


