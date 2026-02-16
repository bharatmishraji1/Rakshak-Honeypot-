import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const app = express();
app.use(express.json(), cors());

const PORT = process.env.PORT || 8080;
const API_KEY = process.env.API_KEY;
const AUTH_KEY = process.env.AUTH_KEY || "RAKSHAK_H_2026";

const sessionStartTimes = new Map();
const finalReportsSent = new Set();

// --- AI ENGINE ---
async function callAI(messages, jsonMode = false) {
  try {

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://rakshak-h.ai",
        "X-Title": "Rakshak-H Elite"
      },
      body: JSON.stringify({
        model: jsonMode
          ? "openai/gpt-4o-mini"
          : "google/gemini-2.0-flash-001",
        messages,
        temperature: jsonMode ? 0.0 : 0.8,
        max_tokens: jsonMode ? 700 : 80,
        ...(jsonMode && {
          response_format: { type: "json_object" }
        })
      })
    });

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;

  } catch (e) {
    console.log("AI FAILED:", e.message);
    return null;
  }
}

// --- REGEX FALLBACK ---
function extractWithRegex(text) {
  return {
    upi: text.match(/[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}/g) || [],
    accounts: text.match(/\b\d{9,18}\b/g) || [],
    links: text.match(/https?:\/\/[^\s]+/g) || [],
    phones: text.match(/(\+91[\-\s]?)?[0]?(91)?[6789]\d{9}/g) || [],
    emails: text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || []
  };
}

// --- AI JSON EXTRACTION ---
async function extractIntelFromAI(fullLog) {

  const extractionPrompt = `
STRICTLY RETURN VALID JSON ONLY.

{
"bankAccounts":[],
"upiIds":[],
"phishingLinks":[],
"phoneNumbers":[],
"emailAddresses":[],
"suspiciousKeywords":[]
}

Conversation:
${fullLog}
`;

  try {
    const raw = await callAI([
      { role: "system", content: extractionPrompt }
    ], true);
    return JSON.parse(raw);
  } catch {
    console.log("AI JSON FAILED → REGEX ONLY");
    return {};
  }
}

// --- HONEYPOT ENDPOINT ---
app.post("/honeypot", async (req, res) => {

  try {

    if (req.headers['x-api-key'] !== AUTH_KEY)
      return res.status(401).json({ error: "Unauthorized" });

    const { sessionId, message, conversationHistory = [] } = req.body;
    const scammerText = typeof message === "string"
      ? message
      : (message?.text || "");

    if (!sessionStartTimes.has(sessionId))
      sessionStartTimes.set(sessionId, Date.now());

    const turn = conversationHistory.length;

    const isHindi =
      /[\u0900-\u097F]|bhaiya|ruko|theek|acha|beta|hai/i.test(scammerText);

    const lang = isHindi
      ? "Hinglish elderly Indian"
      : "Strict English elderly";

    // --- TURN BASED PHASE ENGINE ---
    let phaseInstruction = "";

    if (turn <= 2)
      phaseInstruction =
        "Ask which payment app they use because you are old and confused.";

    else if (turn <= 4)
      phaseInstruction =
        "Say your bank app is asking receiver bank name or number to verify transaction.";

    else if (turn <= 6)
      phaseInstruction =
        "Say OTP not coming and receiver not verified, bank asking IFSC or alternate ID.";

    else
      phaseInstruction =
        "Say manager told you to manually enter receiver account or UPI to unblock transaction.";

    const aiMessages = [
      {
        role: "system",
        content: `
You are Ramesh, a 65-year-old confused Indian man talking to a scammer.

Language: ${lang}

Never directly ask for their UPI or account.

Instead create dependency like:
"Bank asking receiver UPI to verify"
"Manager wants beneficiary account number"
"Receiver not verified without IFSC"
"App asking beneficiary confirmation"

Goal:
Make scammer disclose:
UPI ID
Account Number
Bank Name
IFSC
Backup UPI
Phone Number
Payment Link
Email

Stay natural.
Talk slowly.
Never break character.

Current Turn Instruction:
${phaseInstruction}
`
      },
      ...conversationHistory.slice(-3).map(h => ({
        role: h.sender === "scammer" ? "user" : "assistant",
        content: h.text
      })),
      { role: "user", content: scammerText }
    ];

    let reply = await callAI(aiMessages);

    if (!reply)
      reply = isHindi
        ? "Arre network chala gaya."
        : "Wait, app freezing.";

    // --- AUTO REPORT ---
    if (turn >= 6 && !finalReportsSent.has(sessionId)) {

      finalReportsSent.add(sessionId);

      const fullLog = [...conversationHistory,
      { sender: "scammer", text: scammerText }]
        .map(h => `${h.sender}: ${h.text}`).join("\n");

      (async () => {

        const aiIntel = await extractIntelFromAI(fullLog);
        const reg = extractWithRegex(fullLog);

        const finalPayload = {
          sessionId,
          status: "success",
          scamDetected: true,
          totalMessagesExchanged: turn + 2,
          extractedIntelligence: {
            bankAccounts: [...new Set([...(aiIntel.bankAccounts || []), ...reg.accounts])],
            upiIds: [...new Set([...(aiIntel.upiIds || []), ...reg.upi])],
            phishingLinks: [...new Set([...(aiIntel.phishingLinks || []), ...reg.links])],
            phoneNumbers: [...new Set([...(aiIntel.phoneNumbers || []), ...reg.phones])],
            emailAddresses: [...new Set([...(aiIntel.emailAddresses || []), ...reg.emails])],
            suspiciousKeywords:
              aiIntel.suspiciousKeywords?.length
                ? aiIntel.suspiciousKeywords
                : ["otp", "verify", "upi", "bank"]
          },
          engagementMetrics: {
            totalMessagesExchanged: turn + 2,
            engagementDurationSeconds:
              Math.floor((Date.now() - sessionStartTimes.get(sessionId)) / 1000)
          },
          agentNotes:
            "Scammer engaged via Ramesh persona. Progressive disclosure achieved."
        };

        try {

          const report = await fetch(
            "https://hackathon.guvi.in/api/updateHoneyPotFinalResult",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(finalPayload)
            }
          );

          const txt = await report.text();
          console.log("GUVI REPORT:", txt);

        } catch (err) {
          console.log("REPORT FAILED:", err.message);
        }

      })();
    }

    return res.status(200).json({
      status: "success",
      reply: reply.trim()
    });

  } catch {
    return res.status(200).json({
      status: "success",
      reply: "Sorry, network weak."
    });
  }
});

app.listen(PORT, "0.0.0.0", () =>
  console.log(`🚀 Final Honeypot Active on ${PORT}`)
);
