const express = require("express");
const OpenAI = require("openai");

const app = express();

app.use(express.json({ limit: "10mb" }));
app.use(express.static("public"));

app.post("/api/chat", async (req, res) => {
  try {
    const message = String(req.body.message || "");

    if (!process.env.OPENAI_API_KEY) {
      return res.json({
        reply: "مرحباً بك في الذكاء العربي الخارق! هذه نسخة تجريبية."
      });
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      input: message
    });

    res.json({ reply: response.output_text });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "حدث خطأ، حاول مرة أخرى."
    });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
