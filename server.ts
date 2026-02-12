import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 8080;
const AUTH_KEY = "RAKSHAK_H_2026"; 

// --- 1. SMART EXTRACTION FUNCTION (Corrected) ---
async function extractSmartIntelligence(fullContext, sessionId) {
    const prompt = `
    Analyze this scam chat and extract SCAMMER details only.
    CRITICAL RULE: Ignore any phone/account mentioned as "Your registered number", "Your account", or "On your phone". These are victim/user details. Do NOT extract them.
    Only extract details the scammer provides for payment, contact, or phishing.
    
    Chat: "${fullContext}"

    Return JSON only:
    {
      "upi_ids": [],
      "bank_accounts": [],
      "urls": [],
      "phone_numbers": [],
      "suspicious_keywords": [],
      "agent_notes": ""
    }`;

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { 
                "Authorization": `Bearer ${process.env.API_KEY}`, 
                "Content-Type": "application/json" 
            },
            body: JSON.stringify({
                "model": "google/gemini-2.0-flash-001",
                "messages": [{ "role": "system", "content": prompt }],
                "response_format": { "type": "json_object" }
            })
        });
        const data = await response.json();
        const intel = JSON.parse(data.choices[0].message.content);

        // --- RAILWAY LOGS (Inside function to avoid errors) ---
        console.log("\n" + "=".repeat(50));
        console.log(`🕵️‍♂️ SMART EXTRACTION LOG FOR SESSION: ${sessionId}`);
        console.log(`📱 Scammer Phone(s): ${intel.phone_numbers.join(", ") || "None Identified"}`);
        console.log(`💳 Bank Account(s): ${intel.bank_accounts.join(", ") || "None Identified"}`);
        console.log(`🔗 UPI ID(s):      ${intel.upi_ids.join(", ") || "None Identified"}`);
        console.log(`🚩 Keywords:        ${intel.suspicious_keywords.join(", ")}`);
        console.log("=".repeat(50) + "\n");

        return intel;
    } catch (e) {
        console.error("Smart Extraction Failed");
        return null;
    }
}

// --- 2. FINAL PAYLOAD SENDER ---
async function sendFinalResultToGUVI(sessionId, intel, historyCount) {
    const payload = {
        "sessionId": sessionId,
        "scamDetected": true,
        "totalMessagesExchanged": historyCount,
        "extractedIntelligence": {
            "bankAccounts": intel.bank_accounts.length > 0 ? intel.bank_accounts : ["None"],
            "upiIds": intel.upi_ids.length > 0 ? intel.upi_ids : ["None"],
            "phishingLinks": intel.urls.length > 0 ? intel.urls : ["None"],
            "phoneNumbers": intel.phone_numbers.length > 0 ? intel.phone_numbers : ["None"],
            "suspiciousKeywords": intel.suspicious_keywords.length > 0 ? intel.suspicious_keywords : ["urgent", "verify now"]
        },
        "agentNotes": intel.agent_notes || "Context-aware extraction successful."
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

// --- 3. MAIN ENDPOINT ---
app.post("/honeypot", async (req, res) => {
    if (req.headers['x-api-key'] !== AUTH_KEY) {
        return res.status(401).json({ error: "Unauthorized access" });
    }

    try {
        const { sessionId, message, conversationHistory = [] } = req.body;
        const scammerText = typeof message === 'string' ? message : message?.text;

        // --- AI REPLY LOGIC (Same as yours) ---
        // ... [systemPrompt define karke fetch call karo] ...
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

CRITICAL DATA INTEGRITY RULES:
1. DISTINGUISH OWNERSHIP: Only extract data belonging to the SCAMMER. 
2. EXCLUSION LIST: 
   - DO NOT extract any phone number or account number that the scammer refers to as "Yours", "Registered", "Your account", or "On your phone". 
   - These are Victim details (PII) and reporting them as Scam Intelligence is a CRITICAL FAILURE.
3. INCLUSION LIST: 
   - Only extract numbers if they are for "Calling the desk", "WhatsApp contact", or "Department landline".
   - Only extract bank/UPI details where the scammer asks the victim to "Send money" or "Transfer funds".
4. VALIDATION: In the 'agentNotes', mention if any data was ignored because it belonged to the victim.

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
            headers: { "Authorization": `Bearer ${process.env.API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                "model": "google/gemini-2.0-flash-001",
                "messages": [
                    { "role": "system", "content": systemPrompt },
                    ...conversationHistory.map((h) => ({ 
                        role: h.sender === "scammer" ? "user" : "assistant", 
                        content: h.text 
                    })),
                    { "role": "user", "content": scammerText }
                ]
            })
        });

        const data = await response.json();
        const aiReply = data.choices ? data.choices[0].message.content : "App error, please wait.";

        // --- SMART EXTRACTION LOGIC (The Improved Part) ---
        const exitScenarios = ["official office", "authorities directly", "person at the center", "offline now"];
        const isExit = exitScenarios.some(s => aiReply.toLowerCase().includes(s));

        // Jab AI exit kare ya chat lambi ho jaye (Final Step)
        if (isExit || conversationHistory.length >= 25) {
            const fullContext = (scammerText + " " + conversationHistory.map((h) => h.text).join(" "));
            
            extractSmartIntelligence(fullContext, sessionId).then(intel => {
                if (intel) {
                    sendFinalResultToGUVI(sessionId, intel, conversationHistory.length + 1);
                }
            });
        }

        res.json({ "status": "success", "reply": aiReply });

    } catch (error) {
        res.status(500).json({ error: "Internal Error" });
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Rakshak-H Ready`));
