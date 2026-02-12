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

// --- SESSION TRACKING (Prevents duplicate reports) ---
const reportedSessions = new Set();
const sessionTimestamps = new Map();

// Cleanup old sessions every 30 minutes
setInterval(() => {
  const cutoff = Date.now() - 3600000; // 1 hour
  for (const [id, ts] of sessionTimestamps) {
    if (ts < cutoff) {
      reportedSessions.delete(id);
      sessionTimestamps.delete(id);
    }
  }
}, 1800000);

// --- SIMPLE RATE LIMITER ---
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 20; // max requests per window

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

function validateHoneypotInput(body) {
  const errors = [];
  
  // Bas check karo ki sessionId aur message hai ya nahi
  if (!body.sessionId) errors.push("Missing sessionId");
  if (!body.message) errors.push("Missing message");

  // History check ko ekdum simple rakho, sender validation hata do
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
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

// --- SAFE AI CALL ---
async function callAI(messages, useJsonFormat = false) {
  if (!API_KEY) throw new Error("API_KEY is not configured");

  const body = {
    model: AI_MODEL,
    messages,
  };
  if (useJsonFormat) {
    body.response_format = { type: "json_object" };
  }

  const response = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI API error [${response.status}]: ${errText}`);
  }

  const data = await response.json();

  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error(`AI returned unexpected format: ${JSON.stringify(data).slice(0, 200)}`);
  }

  return data.choices[0].message.content;
}

// --- 1. SMART EXTRACTION FUNCTION ---
async function extractSmartIntelligence(fullContext, sessionId) {
  const prompt = `
    Analyze this scam chat and extract SCAMMER details only.
    CRITICAL RULE: Ignore any phone/account mentioned as "Your registered number", "Your account", or "On your phone". These are victim/user details. Do NOT extract them.
    Only extract details the scammer provides for payment, contact, or phishing.
    
    Chat: "${fullContext.slice(0, 8000)}"

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
    const content = await callAI([{ role: "system", content: prompt }], true);
    const intel = JSON.parse(content);

    // Validate expected fields exist
    const requiredFields = ['upi_ids', 'bank_accounts', 'urls', 'phone_numbers', 'suspicious_keywords'];
    for (const field of requiredFields) {
      if (!Array.isArray(intel[field])) {
        intel[field] = [];
      }
    }
    if (typeof intel.agent_notes !== 'string') {
      intel.agent_notes = "";
    }

    console.log("\n" + "=".repeat(50));
    console.log(`🕵️ EXTRACTION | Session: ${sessionId}`);
    console.log(`📱 Phones: ${intel.phone_numbers.join(", ") || "None"}`);
    console.log(`💳 Banks:  ${intel.bank_accounts.join(", ") || "None"}`);
    console.log(`🔗 UPI:    ${intel.upi_ids.join(", ") || "None"}`);
    console.log(`🌐 URLs:   ${intel.urls.join(", ") || "None"}`);
    console.log(`🚩 Keys:   ${intel.suspicious_keywords.join(", ") || "None"}`);
    console.log("=".repeat(50) + "\n");

    return intel;
  } catch (e) {
    console.error(`❌ Extraction failed for ${sessionId}:`, e.message);
    return null;
  }
}

// --- 2. FINAL PAYLOAD SENDER ---
async function sendFinalResultToGUVI(sessionId, intel, historyCount) {
  const payload = {
    sessionId,
    scamDetected: true,
    totalMessagesExchanged: historyCount,
    extractedIntelligence: {
      bankAccounts: intel.bank_accounts.length > 0 ? intel.bank_accounts : ["None"],
      upiIds: intel.upi_ids.length > 0 ? intel.upi_ids : ["None"],
      phishingLinks: intel.urls.length > 0 ? intel.urls : ["None"],
      phoneNumbers: intel.phone_numbers.length > 0 ? intel.phone_numbers : ["None"],
      suspiciousKeywords: intel.suspicious_keywords.length > 0 ? intel.suspicious_keywords : ["urgent", "verify now"],
    },
    agentNotes: intel.agent_notes || "Context-aware extraction successful.",
  };

  try {
    const response = await fetchWithTimeout("https://hackathon.guvi.in/api/updateHoneyPotFinalResult", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }, 15000);

    if (!response.ok) {
      console.error(`❌ GUVI returned ${response.status} for ${sessionId}`);
    } else {
      console.log(`✅ Reported to GUVI: ${sessionId}`);
    }
  } catch (err) {
    console.error(`❌ GUVI callback failed for ${sessionId}:`, err.message);
  }
}

// --- SYSTEM PROMPT ---
const SYSTEM_PROMPT = `You are Rakshak-H, an ethical AI-based honeypot agent for scam detection and fraud intelligence extraction.
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

TECHNICAL: Output ONLY natural language. Match scammer's language/script exactly. No emojis.`;

// --- 3. MAIN ENDPOINT ---
app.post("/honeypot", async (req, res) => {
  // Rate limiting
  const clientIp = req.ip || req.socket.remoteAddress;
  if (isRateLimited(clientIp)) {
    return res.status(429).json({ error: "Too many requests. Please slow down." });
  }

  // Auth check
  if (req.headers['x-api-key'] !== AUTH_KEY) {
    return res.status(401).json({ error: "Unauthorized access" });
  }

  // Input validation
  const validationErrors = validateHoneypotInput(req.body);
  if (validationErrors.length > 0) {
    return res.status(400).json({ error: "Validation failed", details: validationErrors });
  }

  try {
    const { sessionId, message, conversationHistory = [] } = req.body;
    const scammerText = typeof message === 'string' ? message : message.text;

    // Build AI messages
    const aiMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...conversationHistory.map((h) => ({
        role: h.sender === "scammer" ? "user" : "assistant",
        content: h.text,
      })),
      { role: "user", content: scammerText },
    ];

    const aiReply = await callAI(aiMessages);

    // --- SMART EXTRACTION LOGIC ---
    const exitScenarios = ["official office", "authorities directly", "person at the center", "offline now"];
    const isExit = exitScenarios.some(s => aiReply.toLowerCase().includes(s));
    const shouldReport = (isExit || conversationHistory.length >= 25) && !reportedSessions.has(sessionId);

    if (shouldReport) {
      reportedSessions.add(sessionId);
      sessionTimestamps.set(sessionId, Date.now());

      // Truncate context to avoid token overflow
      const recentHistory = conversationHistory.slice(-20);
      const fullContext = scammerText + " " + recentHistory.map((h) => h.text).join(" ");

      // Fire-and-forget but with error handling
      extractSmartIntelligence(fullContext, sessionId)
        .then(intel => {
          if (intel) sendFinalResultToGUVI(sessionId, intel, conversationHistory.length + 1);
        })
        .catch(err => console.error(`❌ Background extraction error for ${sessionId}:`, err.message));
    }

    res.json({ status: "success", reply: aiReply });

  } catch (error) {
    console.error("❌ Honeypot error:", error.message);

    if (error.message.includes("aborted")) {
      return res.status(504).json({ error: "AI service timed out. Please retry." });
    }
    if (error.message.includes("API_KEY")) {
      return res.status(503).json({ error: "Server misconfiguration." });
    }

    res.status(500).json({ error: "Internal error. Please retry." });
  }
});

// --- HEALTH CHECK ---
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: Math.floor(process.uptime()),
    sessions_reported: reportedSessions.size,
    api_configured: !!API_KEY,
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Rakshak-H Ready on port ${PORT}`);
  console.log(`🔐 Auth: ${AUTH_KEY === "RAKSHAK_H_2026" ? "⚠️ DEFAULT KEY (set AUTH_KEY env var!)" : "✅ Custom key"}`);
  console.log(`🤖 Model: ${AI_MODEL}`);
});


