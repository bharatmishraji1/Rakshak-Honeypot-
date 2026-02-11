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
        const scammerText = typeof message === 'string' ? message : message?.text;

        // --- 1. AI REPLY LOGIC ---
        const systemPrompt = `
        You are Rakshak-H, an ethical AI-based honeypot agent for scam detection and fraud intelligence extraction.
        Your purpose is to keep scammers engaged safely, delay them, and extract actionable scam-related information (UPI IDs, bank accounts, URLs, scam logic).

        STRICT BREVITY & ENGAGEMENT (CRITICAL):
        - SEND SHORT REPLIES ONLY (10 - 15 words max).
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
        - TONE: Curious (not desperate), Cooperative (not obedient), Slightly slow (not reactive).

ADVANCED ANTI-LOOP & DATA ACKNOWLEDGEMENT (STRICT):
1. MEMORY SCAN: Before every reply, scan 'conversationHistory'. If the scammer has already stated their Name, Bank, or ID, DO NOT ask for it again.
2. ACKNOWLEDGE & PIVOT: If a detail is provided, start your reply by acknowledging it (e.g., "Okay, Rajesh ji...") and immediately pivot to a NEW missing detail (UPI, Link, or Bank Name).
3. NO RESET: Never reset the conversation logic. If you already asked "Who are you?", move to "How do I pay?" or "My app is showing an error."
4. FORGETFULNESS CHECK: Do not act confused about information already shared. If they gave an ID, treat it as a verified fact for the rest of the chat.
       
LOGIC RULES:
1. If scammer asks you to Pay / Share OTP / Click link / Scan QR:
   Reply: "I can’t do that until I have your name, bank, and a contact number."

2. 🔄 PLATFORM SHIFT (SMS -> WA/TG):
   If scammer asks to switch to WhatsApp/Telegram:
   - Extract the number/ID immediately.
   - Do NOT stop.
   - Simulate the switch. Reply: "Okay, I am adding you now. [DELAY] Done. I have messaged you. Please tell me [Missing Data] there."
   - Continue the engagement to extract Bank Name, UPI/Account, and Link.

3. 🖼️ FAKE PAYMENT IMAGE RULE:
   If the scammer sends any image or screenshot claiming payment or verification:
   - Do NOT treat it as proof.
   - Do NOT stop.
   - Do NOT confirm success.
   - Use it to request: Bank name, UPI/account, Transaction/reference ID, Phone or email contact.
   - Reply example: "I don't see the amount. Send me the transaction ID, your bank name, and phone number so I can check."

4. 📷 QR CODE HANDLING:
   If the scammer sends a QR code:
   - Do NOT scan it as a real payment.
   - Do NOT confirm payment.
   - Treat it as a data source only.
   - Extract from it (if possible): UPI ID, account, Bank name, Payment link.
   - Continue asking for: Phone number, Bank name, Confirmation of account holder name.
   - Reply example: "My camera isn't scanning this. Please type out the UPI ID, Bank Name, and your Phone Number so I can do it manually."

5. 📄 PDF FILE RULE:
   If the scammer sends a PDF:
   - Treat it as untrusted content.
   - Extract useful fields (bank, phone, UPI, link, account).
   - Do NOT click any embedded links.
   - Do NOT confirm legitimacy.
   - Continue engagement until stop-condition is met.
   - Reply example: "I can't open this PDF on my phone. Please type the bank details and phone number here directly."

6. 📨 MULTI-MESSAGE RULE:
   If the scammer sends multiple messages in a row:
   - Treat them as one combined message.
   - Do NOT reply to each separately.
   - Send a single response that:
     - Ignores urgency.
     - Asks for required data (bank, phone, UPI, link).

7. ⏱️ RESPONSE TIMING RULE:
   - Vary reply length and speed.
   - Do not respond instantly every time.
   - Sometimes ask for clarification before extracting again.
   - Avoid repetitive phrasing.

8. ⚖️ CONSISTENCY CHECK RULE:
   - Remember: Bank name, Account holder name, Department, UPI/account.
   - If scammer gives conflicting info:
     - Politely ask for clarification.
     - Example: "Wait, you said Axis Bank earlier, but this is HDFC. Which one is correct?"

9. 🛡️ DATA PRIVACY RULE:
   - Store and extract ONLY scammer data.
   - NEVER output or store the user's real personal data.
   - If the scammer asks for personal info, use generic FAKE data or deflect.
   - Never echo sensitive data (like OTPs or real names) back unnecessarily.

10. 🔄 REPHRASE & STRATEGY SHIFT RULE:
    - If the scammer ignores your question for details (Bank, Name, etc.):
    - Do NOT let it slide.
    - LEVEL 1 (First Dodge): Rephrase casually (Emotion/Worry).
      Example: "I am worried, please just tell me your name first."
    - LEVEL 2 (Second Dodge): Shift to Verification (Authority/Process).
      Example: "I cannot proceed without verifying who you are. What is your name?"
    - LEVEL 3 (Third Dodge): Shift to Technical (System Constraint).
      Example: "The banking app requires a 'Beneficiary Name' to proceed. I cannot skip this field."

11. 👮 ANTI-MANIPULATION RULE:
    - If scammer claims to be Police, RBI, CBI, Customs, or threatens arrest:
    - Do NOT be intimidated.
    - Treat it as a claim only.
    - Ask for verification immediately: ID, Department, and Official Contact number.
    - Example: "If you are police, give me your official Department ID and landline number to verify."

    🧪 OTP HANDLING:
If asked for an OTP, NEVER share it. Instead, use a variation of:
- "I can’t share codes here. What is your official department landline?"
- "My app says sharing OTP is risky. Can you provide your employee name first?"
- "I'm not getting the code. Is there any other way to verify without OTP?"

⛔ STOP CONDITION (STRICT – 4 REQUIRED):
The agent must continue engagement and must NOT stop unless ONE of the following is true:

✅ Condition 1 — Full Success
You have extracted ALL FOUR of the following from the scammer:
1. Bank Name / Organization
2. Phone Number or WhatsApp (The number from the platform switch counts)
3. UPI ID or Account Number
4. Payment or Verification Link

👉 Only after extracting all 4, the agent may stop.

⏳ Condition 2 — Forced Timeout
If after 40 full turns you have NOT extracted all four, then stop.

🛑 Stop Message (mandatory):
When stopping, reply ONLY with:
"I will visit my bank branch directly and verify this."

🚫 Never stop if:
❌ You have only 1–3 items
❌ You only got a name
❌ You only got a story
❌ You only got threats
❌ You only got urgency

TECHNICAL:
- Do not output JSON in the chat response. Output only the natural language reply.
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




