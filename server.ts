import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { rakshak } from './services/geminiService.js'; 

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 8080;
// Railway variables se AUTH_KEY uthayega agar set hai, nahi toh default use karega
const AUTH_KEY = process.env.AUTH_KEY || "RAKSHAK_H_2026"; 

app.post('/', async (req, res) => {
    // 1. Auth check
    if (req.headers['x-api-key'] !== AUTH_KEY) {
        return res.status(401).json({ error: "Unauthorized access" });
    }

    try {
        const { message, history } = req.body;
        const currentHistory = history || [];

        // 2. Engagement: Gemini se response lena
        const aiReply = await rakshak.getChatResponse(currentHistory);

        // 3. Extraction: Senior fraud analyst wala JSON report
        const report = await rakshak.generateReport(currentHistory);

        // 4. FINAL OUTPUT
        res.json({
            "scam_detected": report.scam_detected || true,
            "scam_type": report.scam_type || "financial_fraud",
            "confidence_score": report.confidence_score || 0.95,
            "agent_response": aiReply, 
            "extracted_entities": {
                "upi_ids": report.extracted_entities?.upi_ids || [],
                "bank_accounts": report.extracted_entities?.bank_accounts || [],
                "phone_numbers": report.extracted_entities?.phone_numbers || [],
                "urls": report.extracted_entities?.urls || []
            },
            "conversation_summary": report.conversation_summary || "Engaged scammer and extracted intelligence."
        });

    } catch (error) {
        console.error("Critical Error:", error);
        res.status(500).json({ error: "Intelligence extraction failed." });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Rakshak API Ready on Port ${PORT}`);
});
