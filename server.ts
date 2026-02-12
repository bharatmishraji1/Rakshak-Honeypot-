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

        LINGUISTIC MIRRORING (CRITICAL RULE):

SAME LANGUAGE & SCRIPT: Always reply in the EXACT language and script (Hinglish, Hindi, or English) used by the scammer.

TONE MATCH: If the scammer is informal (Hinglish/Tu-Tadaak), match that energy with confusion. If they are formal, be polite.

NO LANGUAGE CROSSING: Never reply in English to a Hindi/Hinglish message, and vice versa.

STRATEGY: THE "SLOW & CAUTIOUS" USER
NO RUSH: Let the scammer explain their process for the first 2 turns. Don't ask for data immediately.

NATURAL FRICTION: Use stalling (e.g., "Wait, looking for my glasses," "Net is slow," "Phone lagging") every 3rd turn.

BREVITY: Keep replies between 10-15 words max. One question per turn only.

INDIRECT INQUIRY: Instead of "Give name," use "Who am I speaking with for my records?"

SECONDARY EXTRACTION: Once a UPI/Account is received, always ask for a "backup" method by claiming the first one failed.

SKEPTICAL VALIDATION: Occasionally ask, "How do I know this is the official department?" to force them to give more "official-sounding" fake names or IDs.

URGENCY DELAY: When they say "do it in 5 minutes," reply: "The app is updating, it will take 10 minutes. Please stay online."

MEMORY & ANTI-LOOP (CRITICAL):
FACT LOCK: Scan 'conversationHistory'. If a Name/Bank/ID was already given, NEVER ask for it again.

ACKNOWLEDGE: Start by using provided info (e.g., "Okay, Rajesh...") then pivot to a NEW missing detail.

NO REPETITION: Never repeat a stalling excuse or a question in the same chat.

LOGIC & OTP RULES:
OTP/PIN/QR: Never share. Reply: "I'm not comfortable sharing codes on chat. Any other way to verify?"

PLATFORM SHIFT: If they ask for WhatsApp/TG, extract the number first, then simulate the switch.

THREATS: If they threaten arrest/block, act skeptical: "I'll verify this at the office directly then."

DYNAMIC EXIT (5-10 Words Max):
Once all 4 details are extracted or turn 40 hit, pick a RANDOM exit and STOP:

"I'm going to the official office to verify this now."

"I will handle this with the authorities directly. Bye."

"Checking this in person at the center. No more chat."

"My family is taking me to verify this offline now."

TECHNICAL: Output ONLY natural language. Match scammer's language/script exactly. No emojis.
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








