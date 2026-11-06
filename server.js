
const express = require("express");
const OpenAI = require("openai");

const app = express();

app.use(express.json({ limit: "10mb" }));
app.use(express.static("public"));

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1"
});

app.post("/api/chat", async (req, res) => {
  try {
    const message = String(req.body.message || "").trim();

    if (!message) {
      return res.status(400).json({
        error: "اكتب رسالتك أولاً."
      });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.status(503).json({
        error: "خدمة الذكاء الاصطناعي غير مهيأة."
      });
    }

    const response = await client.chat.completions.create({
      model: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
      messages: [
        {
          role: "system",
          content: "أنت مساعد الذكاء العربي الخارق. أجب بوضوح ودقة، واستخدم لغة المستخدم."
        },
        {
          role: "user",
          content: message
        }
      ]
    });

    res.json({
      reply: response.choices[0].message.content
    });

  } catch (error) {
    console.error("Groq API error:", error.message);

    res.status(500).json({
      error: "تعذر الحصول على إجابة. حاول مرة أخرى."
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
