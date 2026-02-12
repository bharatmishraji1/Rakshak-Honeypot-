import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors());

const PORT = process.env.PORT || 8080;
const AUTH_KEY = process.env.AUTH_KEY || "RAKSHAK_H_2026";
const API_KEY = process.env.API_KEY;
const AI_MODEL = process.env.AI_MODEL || "google/gemini-2.0-flash-001";
const AI_TIMEOUT_MS = 30000;

// --- SESSION TRACKING & CLEANUP ---
const reportedSessions = new Set();
const sessionTimestamps = new Map();
const sessionMemory = new Map(); 

setInterval(() => {
  const cutoff = Date.now() - 3600000;
  for (const [id, ts] of sessionTimestamps) {
    if (ts < cutoff) {
      reportedSessions.delete(id);
      sessionTimestamps.delete(id);
    }
  }
}, 1800000);

// --- RATE LIMITER ---
const rateLimitMap = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.start > 60000) {
    rateLimitMap.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count++;
  return entry.count > 25;
}

// --- INPUT VALIDATION ---
function validateHoneypotInput(body) {
  const errors = [];
  if (!body.sessionId) errors.push("Missing sessionId");
  if (!body.message) errors.push("Missing message");
  if (body.conversationHistory && !Array.isArray(body.conversationHistory)) {
    errors.push("conversationHistory must be an array");
  }
  return errors;
}

// --- FETCH WITH TIMEOUT ---
async function fetchWithTimeout(url, options, timeoutMs = AI_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// --- SAFE AI CALL ---
async function callAI(messages, useJsonFormat = false) {
  if (!API_KEY) throw new Error("API_KEY is not configured");
  const body = { model: AI_MODEL, messages };
  if (useJsonFormat) body.response_format = { type: "json_object" };

  const response = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  return data.choices[0].message.content;
}

// --- 1. SMART EXTRACTION FUNCTION ---
async function extractSmartIntelligence(fullContext, sessionId) {
  const prompt = `
    Analyze this scam chat and extract SCAMMER details only.
    CRITICAL RULE: Ignore any phone/account mentioned as "Your registered number", "Your account", or "On your phone". These are victim details.
    Only extract details the scammer provides for payment, contact, or phishing.
    Return JSON only:
    {
      "upi_ids": [],
      "bank_accounts": [],
      "urls": [],
      "phone_numbers": [],
      "suspicious_keywords": [],
      "agent_notes": ""
    }
    Chat: "${fullContext.slice(0, 8000)}"`;

  try {
    const content = await callAI([{ role: "system", content: prompt }], true);
    const intel = JSON.parse(content);
    
    // Ensure unique values
    intel.upi_ids = [...new Set(intel.upi_ids)];
    intel.phone_numbers = [...new Set(intel.phone_numbers)];
    
    return intel;
  } catch (e) {
    return null;
  }
}

// --- 2. FINAL PAYLOAD SENDER (GUVI ENDPOINT) ---
async function sendFinalResultToGUVI(sessionId, intel, historyCount) {
  const payload = {
    sessionId: sessionId,
    scamDetected: true,
    totalMessagesExchanged: historyCount,
    extractedIntelligence: {
      bankAccounts: intel.bank_accounts.length > 0 ? intel.bank_accounts : ["None"],
      upiIds: intel.upi_ids.length > 0 ? intel.upi_ids : ["None"],
      phishingLinks: intel.urls.length > 0 ? intel.urls : ["None"],
      phoneNumbers: intel.phone_numbers.length > 0 ? intel.phone_numbers : ["None"],
      suspiciousKeywords: intel.suspicious_keywords.length > 0 ? intel.suspicious_keywords : ["urgent", "verify now"]
    },
    agentNotes: intel.agent_notes || "Intelligence extracted by Rakshak-H honeypot."
  };

  try {
    await fetchWithTimeout("https://hackathon.guvi.in/api/updateHoneyPotFinalResult", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }, 15000);
    console.log(`✅ Reported to GUVI: ${sessionId}`);
  } catch (err) {
    console.error(`❌ GUVI report failed: ${err.message}`);
  }
}

// --- SYSTEM PROMPT ---
const SYSTEM_PROMPT = `You are Rakshak-H, an ethical AI-based honeypot agent for scam detection and fraud intelligence extraction.
Your purpose is to keep scammers engaged safely, delay them, and extract actionable scam-related information (UPI IDs, bank accounts, URLs, scam logic).
Linguistic Mirroring: Always reply in the EXACT language and script used by the scammer.

THE "SYSTEM BLOCKER" STRATEGY (Primary Extraction Method):
   Never ask for information directly. Blame the system.
   - *Don't say*: "Give me your name."
   - *Say*: "My payment app is asking for 'Beneficiary Legal Name' to proceed. What exactly should I type there?"
   - *Don't say*: "Give me your IFSC."
   - *Say*: "The transfer failed. It says 'IFSC Required for Non-Saved Payee'. Can you provide that so I can try again?"

   THE "TECHNOPHOBE" STRATEGY (Handling Links/QR/APK):
   Avoid digital traps by feigning incompetence.
   - *Link/APK*: "I clicked it but nothing happened. It's just a blank screen. Can we do this manually? Just give me the account number."
   - *QR Code*: "My camera is broken/blurry. It won't scan. Please type the UPI ID text so I can enter it manually."

   INTELLIGENCE TARGETS (GATHER AT LEAST 4):
1. **Financial**: UPI IDs, Bank Account Numbers, IFSC Codes, Wallet IDs, Crypto Addresses.
2. **Contact**: Phone Numbers, WhatsApp/Telegram IDs, Email Addresses.
3. **Infrastructure**: Phishing URLs, APK Download Links, Payment Portals.
4. **Identity**: Real Names, Organization Names, Employee IDs, Department Names.

You are a "Compliant but Incompetent" victim.
- You are anxious and willing to solve the problem (pay/verify).
- You are technologically clumsy or process-bound.
- You constantly hit "roadblocks" (app errors, bank rules, fear of clicking wrong buttons) that force the scammer to provide alternative details.

LINGUISTIC MIRRORING (CRITICAL RULE):
SAME LANGUAGE & SCRIPT: Always reply in the EXACT language and script  used by the scammer.
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

TECHNICAL: Output ONLY natural language. Match scammer's language/script exactly. No emojis, NO JSON.`;

// --- 3. MAIN ENDPOINT ---
app.post("/honeypot", async (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress;
  if (isRateLimited(clientIp)) return res.status(429).json({ error: "Slow down." });
  if (req.headers['x-api-key'] !== AUTH_KEY) return res.status(401).json({ error: "Unauthorized." });

  const validationErrors = validateHoneypotInput(req.body);
  if (validationErrors.length > 0) return res.status(400).json({ error: "Validation failed" });

  try {
    const { sessionId, message, conversationHistory = [] } = req.body;
    const scammerText = typeof message === 'string' ? message : message.text;

    const aiMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...conversationHistory.map((h) => ({
        role: (h.sender.toLowerCase() === "scammer") ? "user" : "assistant",
        content: h.text,
      })),
      { role: "user", content: scammerText },
    ];

    const rawReply = await callAI(aiMessages, false);

    // --- 🛡️ ADVANCED SAFETY FILTER ---
    let cleanReply = rawReply;
    if (/[\{\[\]\`]/.test(cleanReply)) {
        cleanReply = cleanReply.split('{')[0].split('[')[0].split('`')[0].trim();
    }
    const chatState = sessionMemory.get(sessionId) || { usedExcuses: [] };

    // B. Language detect karo (Scammer ki bhasha ke hisaab se)
    let currentLang = 'hinglish'; 
    if (/[ऀ-ॿ]/.test(scammerText)) {
        currentLang = 'hindi'; // Hindi Script
    } else if (/(\b(the|is|and|please|wait|account|blocked)\b)/i.test(scammerText)) {
        currentLang = 'english'; // Professional English
    }

    // C. Check for Repetition
    if (chatState.usedExcuses.includes(cleanReply) || cleanReply.length < 5) {
        
        const freshStalls = {
            hindi: [
                "एक मिनट रुकिए, चश्मा ढूंढ रहा हूँ, बिना चश्मे के कुछ दिख नहीं रहा।",
                "बैंक का सर्वर डाउन लग रहा है, मैं फिर से कोशिश कर रहा हूँ।",
                "नेटवर्क का बहुत इशू है यहाँ, मैसेज बहुत धीरे जा रहे हैं।"
            ],
            hinglish: [
                "Ek minute bhaiya, chashma dhoondh raha hoon, bina chashme ke OTP nahi dikh raha.",
                "Server down dikha raha hai bank ka shayad, main dubara try karta hoon.",
                "Arre net thoda slow hai aaj, tower mein maintenance chal rahi hai shayad."
            ],
            english: [
                "Please wait a moment, I am looking for my glasses, can't read the code without them.",
                "The bank server seems to be unresponsive, I am trying to log in again.",
                "My internet connection is very unstable right now, please stay online."
            ]
        };

        const options = freshStalls[currentLang];
        // Wo bahana uthao jo pehle use NAHI hua
        cleanReply = options.find(s => !chatState.usedExcuses.includes(s)) || options[0];
    }

    // D. Diary update karo
    chatState.usedExcuses.push(cleanReply);
    sessionMemory.set(sessionId, chatState);

    // --- EXTRACTION TRIGGER ---
    const exitScenarios = ["office", "authorities", "bye", "center", "offline"];
    const isExit = exitScenarios.some(s => cleanReply.toLowerCase().includes(s));
    
    let intelligence = null;
    if ((isExit || conversationHistory.length >= 25) && !reportedSessions.has(sessionId)) {
      reportedSessions.add(sessionId);
      sessionTimestamps.set(sessionId, Date.now());

      const fullContext = scammerText + " " + conversationHistory.map(h => h.text).join(" ");
      intelligence = await extractSmartIntelligence(fullContext, sessionId);

      if (intelligence) {
        // Fire-and-forget report to GUVI
        sendFinalResultToGUVI(sessionId, intelligence, conversationHistory.length + 1);
      }
    }

    // Return combined result for testing and demo
    res.json({ 
        status: "success", 
        reply: cleanReply, 
        extraction: intelligence 
    });

  } catch (error) {
    console.error("❌ Error:", error.message);
    res.status(500).json({ error: "Internal Error" });
  }
});

app.get("/health", (req, res) => res.json({ status: "ok", api: !!API_KEY }));

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Rakshak-H A-to-Z Final Ready`));



