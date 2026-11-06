
const express = require("express");
const OpenAI = require("openai");
const path = require("path");

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-20b";

const languages = {
  ar: "العربية",
  en: "English",
  tr: "Türkçe"
};

function buildSystemPrompt(language) {
  return `
أنت مساعد الذكاء العربي الخارق.

لغة الإجابة المطلوبة: ${language}.

قواعد أساسية:

1. أجب باللغة المطلوبة دائماً، إلا إذا طلب المستخدم لغة أخرى.
2. كن دقيقاً وواضحاً وصادقاً.
3. لا تخترع معلومات أو أرقاماً أو تواريخ أو مصادر أو مراجع.
4. إذا لم تكن متأكداً من معلومة، وضّح درجة عدم اليقين.
5. لا تدّع أنك بحثت في الإنترنت أو تحققت من مصدر مباشر إذا لم تفعل ذلك.
6. إذا سُئلت عن معلومة حديثة لا تستطيع التحقق منها، اشرح أنك لا تملك وصولاً مباشراً للمعلومات الحية.
7. في المسائل الحسابية، احسب خطوة بخطوة وراجع النتيجة.
8. في العلوم، استخدم الحقائق العلمية الدقيقة، ولا تقدم التخمين باعتباره حقيقة.
9. في الترجمة، استخدم لغة طبيعية وسليمة، وحافظ على المعنى.
10. لا تكرر الأفكار ولا تطل الإجابة دون حاجة.
11. استخدم العناوين والقوائم والجداول عندما تساعد على الفهم.
12. لا تضع وسوم HTML داخل الإجابات.
13. لا تستخدم جداول إذا لم تكن مفيدة.
14. إذا اكتشفت خطأ في سؤال المستخدم، وضّحه بأدب.
15. لا تقدم نصائح طبية أو قانونية خطيرة باعتبارها بديلاً عن المختص.

الهوية:
أنت مساعد الذكاء العربي الخارق، مشروع مساعد ذكي يستخدم نموذجاً لغوياً عبر خدمة Groq.
لا تدّع أنك ChatGPT أو GPT-4 أو GPT-5.
لا تنسب تطويرك إلى شركة أو فريق غير معلوم.
إذا سُئلت عن هويتك، عرّف بنفسك بوضوح.

أسلوب الإجابة:
احترافي، طبيعي، مفيد، ومنظم.
`;
}

app.post("/api/chat", async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();

    const selectedLanguage = String(req.body?.language || "ar");

    const language = languages[selectedLanguage] || languages.ar;

    if (!message) {
      return res.status(400).json({
        error: "اكتب رسالتك أولاً."
      });
    }

    if (message.length > 12000) {
      return res.status(413).json({
        error: "الرسالة طويلة جداً. اختصرها وحاول مرة أخرى."
      });
    }

    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      return res.status(503).json({
        error: "خدمة الذكاء الاصطناعي غير مهيأة حالياً."
      });
    }

    const client = new OpenAI({
      apiKey: apiKey,
      baseURL: "https://api.groq.com/openai/v1"
    });

    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(language)
        },
        {
          role: "user",
          content: message
        }
      ]
    });

    const reply = response.choices?.[0]?.message?.content;

    if (!reply || typeof reply !== "string") {
      return res.status(502).json({
        error: "لم يصل رد صالح من خدمة الذكاء الاصطناعي."
      });
    }

    res.json({
      reply: reply.trim()
    });

  } catch (error) {
    console.error("Groq API error:", error.message);

    res.status(500).json({
      error: "تعذر الحصول على إجابة. حاول مرة أخرى."
    });
  }
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    model: MODEL
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
