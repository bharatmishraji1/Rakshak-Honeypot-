import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 8080;
const AUTH_KEY = "RAKSHAK_H_2026"; 

// --- DHYAN SE DEKHO: Railway Dashboard wala naam 'GOOGLE_API_KEY' hai ---
const API_KEY = process.env.API_KEY || "";
const genAI = new GoogleGenerativeAI(API_KEY);

app.post("/honeypot", async (req, res) => {
    // 1. Auth check
    if (req.headers['x-api-key'] !== AUTH_KEY) {
        return res.status(401).json({ error: "Unauthorized access" });
    }

    try {
        const { message, history } = req.body;
        // Poori conversation ko ek sath jodo taaki context mile
        const fullChat = (history || []).map((h: any) => h.content).join(" ") + " " + (message || "");

        // --- 2. SMART EXTRACTION LOGIC (YAHAN PASTE HUA HAI) ---
        const upiRegex = /[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}/g;
        const phoneRegex = /(\+91[\-\s]?)?[0]?(91)?[6789]\d{9}/g;
        const urlRegex = /(https?:\/\/[^\s]+)/g;

        const extractedUpi = fullChat.match(upiRegex) || [];
        const extractedPhone = fullChat.match(phoneRegex) || [];
        const extractedUrls = fullChat.match(urlRegex) || [];

        // Dynamic Detection: Agar kuch suspicious mila tabhi true hoga
        const isScam = extractedUpi.length > 0 || extractedUrls.length > 0 || extractedPhone.length > 0;

        // --- 3. DYNAMIC REPORT GENERATION ---
        const report = {
            "scam_detected": isScam, 
            "scam_type": isScam ? "financial_fraud" : "normal_conversation",
            "confidence_score": isScam ? 0.98 : 0.05,
            "extracted_entities": {
                "upi_ids": [...new Set(extractedUpi)],
                "bank_accounts": [],
                "phone_numbers": [...new Set(extractedPhone)],
                "urls": [...new Set(extractedUrls)]
            },
            "conversation_summary": isScam ? "Suspicious entities detected." : "Safe interaction."
        };

        // --- 4. FINAL OUTPUT (Buildathon Schema) ---
        res.json({
            "scam_detected": report.scam_detected,
            "scam_type": report.scam_type,
            "confidence_score": report.confidence_score,
            "agent_response": "I am analyzing the safety of this interaction.", 
            "extracted_entities": report.extracted_entities,
            "conversation_summary": report.conversation_summary
        });

    } catch (error) {
        console.error("Critical Error:", error);
        res.status(500).json({ error: "Intelligence extraction failed." });
    }
});


