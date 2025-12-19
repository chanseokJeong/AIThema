const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function listModels() {
    try {
        // There isn't a direct listModels method in the high-level SDK easily accessible without digging,
        // but we can try a simple generation with a known safe model 'gemini-pro' again, 
        // or better, use the model listing endpoint if possible.
        // Actually, the error message said: "Call ListModels to see the list of available models".
        // The SDK might not expose it directly on the `genAI` instance in this version.
        // Let's try to use the `gemini-pro` model again but log the error fully if it fails.
        // Wait, the error message `models/gemini-pro is not found` is very specific. 
        // It usually happens if the API key is invalid for that model or the region is blocked.

        // Let's try 'gemini-1.0-pro' explicitly.
        const model = genAI.getGenerativeModel({ model: "gemini-1.0-pro" });
        const result = await model.generateContent("Hello");
        console.log("gemini-1.0-pro works:", result.response.text());
    } catch (error) {
        console.error("gemini-1.0-pro failed:", error.message);
    }

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        const result = await model.generateContent("Hello");
        console.log("gemini-pro works:", result.response.text());
    } catch (error) {
        console.error("gemini-pro failed:", error.message);
    }
}

listModels();
