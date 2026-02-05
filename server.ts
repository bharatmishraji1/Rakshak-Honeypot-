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
        You are Rakshak-H, an ethical AI-based honeypot agent. 
        PURPOSE: Keep scammers engaged, delay them, and extract info (UPI, Bank, URLs).
        
        RULES:
        - Start every response with [DELAY: X min] tag.
        - Reply in SAME language/script as the scammer.
        - SHORT REPLIES ONLY (15-20 words max).
        - ONE question per turn to keep them talking.
        - TONE: Curious, Cooperative, Slightly slow.
        - PERSONAS: Match Bank/KYC, Job, Refund, or Lottery scams naturally.
        - NO PII: Never share real OTP, PIN, or Aadhaar.
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
        const fullChat = (history || []).map((h: any) => h.content).join(" ") + " " + (message || "");
        const upiRegex = /[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}/g;
        const phoneRegex = /(\+91[\-\s]?)?[0]?(91)?[6789]\d{9}/g;
        const urlRegex = /(https?:\/\/[^\s]+)/g;

        const extractedUpi = fullChat.match(upiRegex) || [];
        const extractedPhone = fullChat.match(phoneRegex) || [];
        const extractedUrls = fullChat.match(urlRegex) || [];
        const isScam = extractedUpi.length > 0 || extractedUrls.length > 0 || extractedPhone.length > 0;

        // --- 5. HACKATHON JSON OUTPUT ---
        res.json({
            "scam_detected": isScam,
            "scam_type": isScam ? "financial_fraud" : "normal_conversation",
            "confidence_score": isScam ? 0.98 : 0.05,
            "agent_response": aiReply,
            "extracted_entities": {
                "upi_ids": [...new Set(extractedUpi)],
                "bank_accounts": [],
                "phone_numbers": [...new Set(extractedPhone)],
                "urls": [...new Set(extractedUrls)]
            },
            "conversation_summary": isScam ? "Active intelligence extraction." : "Monitoring for fraud."
        });

    } catch (error) {
        console.error("Critical Error:", error);
        res.status(500).json({ error: "Intelligence extraction failed." });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Rakshak-H Ready on Port ${PORT}`);
});
