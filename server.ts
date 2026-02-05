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
        console.log("📩 NEW REQUEST RECEIVED!");
        console.log("📝 Message Content:", message);

        // --- 2. DYNAMIC AI CALL (OpenRouter) ---
        // Yahan 'fetch' route ke andar hona chahiye
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.YOUR_API_KEY}`, // Railway Dashboard mein 'YOUR_API_KEY' check karo
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "google/gemini-2.0-flash-001", 
                messages: [
                    { role: "system", content: "You are a victim. Be curious and cooperative but slightly slow." },
                    { role: "user", content: message }
                ]
            })
        });

        const data: any = await response.json();
        
        // AI reply extract karo, agar fail ho toh dummy reply mat dena
        const aiReply = data.choices ? data.choices[0].message.content : "Hmm, I am not sure about that...";
        console.log("🤖 AI Reply:", aiReply);

        // --- 3. EXTRACTION LOGIC ---
        const fullChat = (history || []).map((h: any) => h.content).join(" ") + " " + (message || "");
        const upiRegex = /[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}/g;
        const phoneRegex = /(\+91[\-\s]?)?[0]?(91)?[6789]\d{9}/g;
        
        const extractedUpi = fullChat.match(upiRegex) || [];
        const extractedPhone = fullChat.match(phoneRegex) || [];
        const isScam = extractedUpi.length > 0 || extractedPhone.length > 0;

        // --- 4. FINAL OUTPUT ---
        res.json({
            "scam_detected": isScam,
            "scam_type": isScam ? "financial_fraud" : "normal_conversation",
            "confidence_score": isScam ? 0.98 : 0.05,
            "agent_response": aiReply,
            "extracted_entities": {
                "upi_ids": [...new Set(extractedUpi)],
                "bank_accounts": [],
                "phone_numbers": [...new Set(extractedPhone)],
                "urls": []
            },
            "conversation_summary": isScam ? "Suspicious entities detected." : "Safe interaction."
        });

    } catch (error) {
        console.error("Critical Error:", error);
        res.status(500).json({ error: "Intelligence extraction failed." });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Rakshak API Ready on Port ${PORT}`);
});
