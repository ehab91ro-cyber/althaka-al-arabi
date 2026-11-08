'use strict';

const express = require('express');
const OpenAI = require('openai');
const multer = require('multer');
const path = require('path');
const dns = require('dns').promises;
const net = require('net');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = Number(process.env.PORT || 3000);

// النماذج الفائقة لعام 2026 على محركات Groq اللحظية
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b'; 
const VISION_MODEL = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b'; 
const AUDIO_MODEL = process.env.GROQ_AUDIO_MODEL || 'whisper-large-v3-turbo';

const REQUEST_TIMEOUT_MS = 15000;
const MAX_SEARCH_RESULTS = 10;
const ALLOWED_LANGUAGES = new Set(['ar', 'en', 'tr']);
const USER_AGENT = 'ArabicSuperIntelligence/3.0';

let groqClient = null;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 8,
    fileSize: 45 * 1024 * 1024 
  },
  fileFilter: (_req, file, callback) => {
    const mime = String(file.mimetype || '').toLowerCase();

    if (file.fieldname === 'audio' || file.fieldname === 'video') {
      const allowedMedia = [
        'audio/webm', 'audio/ogg', 'audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/m4a',
        'video/mp4', 'video/webm', 'video/quicktime'
      ];
      return callback(null, allowedMedia.includes(mime));
    }

    if (file.fieldname === 'files') {
      const allowedDocsAndImages = [
        'image/jpeg', 'image/png', 'image/webp', 'image/gif',
        'text/plain', 'text/markdown', 'text/csv', 'application/json'
      ];
      return callback(null, allowedDocsAndImages.includes(mime));
    }

    callback(null, false);
  }
});

function getGroqClient() {
  if (!process.env.GROQ_API_KEY) {
    const error = new Error('GROQ_API_KEY غير مضبوط في إعدادات البيئة.');
    error.status = 503;
    throw error;
  }
  if (!groqClient) {
    groqClient = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://groq.com',
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: 1
    });
  }
  return groqClient;
}

function normalizeText(value, max = 4000) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function detectLanguage(text, requested) {
  const selected = String(requested || '').toLowerCase();
  if (ALLOWED_LANGUAGES.has(selected)) return selected;

  const value = String(text || '');
  if (/[ğüşöçıİĞÜŞÖÇ]/i.test(value)) return 'tr';

  const arabic = (value.match(/[\u0600-\u06FF]/g) || []).length;
  const latin = (value.match(/[A-Za-z]/g) || []).length;
  if (arabic > latin) return 'ar';

  return 'en';
}

function buildSystemPrompt(lang) {
  const name = lang === 'tr' ? 'Turkish' : lang === 'en' ? 'English' : 'Arabic';
  return `أنت «الذكاء العربي الخارق»، مساعد ذكي فائق السرعة، صممه العبقري إيهاب عادل شالاتي.
أجب بلغة المستخدم (${name}) فوراً وبأعلى دقة ممكنة وبسرعة مطلقة.
إذا سُئلت «من أنت؟» فقل بثقة: «أنا الذكاء العربي الخارق، تم تصميمي من قبل العبقري إيهاب عادل شالاتي».
إذا لم تتوفر لديك معلومات موثقة بشأن الأحداث والأخبار خلال الـ 24 ساعة الماضية، صرّح بذلك بوضوح ولا تقم بتأليف أخبار أو تواريخ قديمة.`;
}

function detectSearchNeeds(message) {
  return /(ابحث|بحث|آخر|أحدث|اليوم|الآن|حالياً|خبر|أخبار|سعر|تحديث|أمس|24 ساعة|latest|recent|today|now|news|search|current|bugün|son|haber|güncel)/i.test(String(message || ''));
}

async function searchTavily(query) {
  if (!process.env.TAVILY_API_KEY) return [];
  try {
    const response = await fetch('https://tavily.com', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query: normalizeText(query, 350),
        topic: 'news',
        search_depth: 'advanced',
        max_results: MAX_SEARCH_RESULTS,
        time_range: 'day'
      })
    });
    if (!response.ok) return [];
    const data = await response.json();
    return (data?.results || []).map(item => ({
      source: 'تصفح الويب الحي',
      title: item.title,
      text: item.content,
      url: String(item.url || ''),
      publishedDate: item.published_date || null
    }));
  } catch (error) {
    console.warn('Tavily Live Search Error:', error.message);
    return [];
  }
}

function extractUploadedContent(files) {
  const images = [];
  const documents = [];
  for (const file of files) {
    const mime = String(file.mimetype || '').toLowerCase();
    if (mime.startsWith('image/')) {
      images.push({
        name: normalizeText(file.originalname, 120),
        mime,
        data: file.buffer.toString('base64')
      });
    } else {
      const text = file.buffer.toString('utf8');
      documents.push({
        name: normalizeText(file.originalname, 120),
        text: text.slice(0, 25000)
      });
    }
  }
  return { images, documents };
}

async function transcribeMedia(file, lang) {
  const groq = getGroqClient();
  const mediaBlob = new Blob([file.buffer], { type: file.mimetype });
  const mediaFile = new File([mediaBlob], file.originalname || 'media_input.webm', { type: file.mimetype });
  const response = await groq.audio.transcriptions.create({
    file: mediaFile,
    model: AUDIO_MODEL,
    language: ALLOWED_LANGUAGES.has(lang) ? lang : undefined
  });
  return normalizeText(response.text, 12000);
}

app.post('/api/chat', upload.fields([
  { name: 'files', maxCount: 5 },
  { name: 'audio', maxCount: 1 },
  { name: 'video', maxCount: 1 }
]), async (req, res) => {
  try {
    const body = req.body || {};
    const message = normalizeText(body.message || body.prompt, 12000);
    const uploadedFiles = req.files?.files || [];
    const audioFile = req.files?.audio?.[0] || null;
    const videoFile = req.files?.video?.[0] || null;

    if (!message && !uploadedFiles.length && !audioFile && !videoFile) {
      return res.status(400).json({ error: 'الرجاء كتابة نص أو إدخال ملف، صوت، أو فيديو لمعالجته.' });
    }

    const lang = detectLanguage(message, body.language);
    let mediaTranscript = '';

    const targetMedia = videoFile || audioFile;
    if (targetMedia) {
      try {
        mediaTranscript = await transcribeMedia(targetMedia, lang);
      } catch (err) {
        return res.status(500).json({ error: `فشل معالجة ملف الوسائط: ${err.message}` });
      }
    }

    const messages = [{ role: 'system', content: buildSystemPrompt(lang) }];

    if (body.history) {
      try {
        const parsedHistory = Array.isArray(body.history) ? body.history : JSON.parse(body.history);
        parsedHistory.slice(-6).forEach(item => {
          if (item.role && item.content) {
            messages.push({ role: item.role, content: normalizeText(item.content, 2000) });
          }
        });
      } catch (e) {}
    }

    let liveSources = [];
    const combinedQuery = [message, mediaTranscript].filter(Boolean).join(' ');
    
    if (detectSearchNeeds(combinedQuery)) {
      liveSources = await searchTavily(combinedQuery);
      messages.push({
        role: 'system',
        content: liveSources.length 
          ? `أخبار حية ومؤكدة نُشرت خلال الـ 24 ساعة الماضية استعن بها فوراً:\n${JSON.stringify(liveSources)}`
          : `تنبيه: لم يتم العثور على مقالات إخبارية موثوقة نُشرت طوال الـ 24 ساعة الماضية حول هذا الموضوع.`
      });
    }

    const { images, documents } = extractUploadedContent(uploadedFiles);
    let userStructuredContent = [];
    
    if (message) userStructuredContent.push({ type: 'text', text: message });
    if (mediaTranscript) userStructuredContent.push({ type: 'text', text: `[المحتوى المستخرج من الـ ${videoFile ? 'فيديو' : 'صوت'}]: ${mediaTranscript}` });

    documents.forEach(doc => {
      userStructuredContent.push({ type: 'text', text: `\n[محتوى مستند نصي ${doc.name}]:\n${doc.text}` });
    });

    images.forEach(img => {
      userStructuredContent.push({
        type: 'image_url',
        image_url: { url: `data:${img.mime};base64,${img.data}` }
      });
    });

    const activeModel = images.length > 0 ? VISION_MODEL : GROQ_MODEL;
    messages.push({ role: 'user', content: userStructuredContent });

    const groq = getGroqClient();
    const completion = await groq.chat.completions.create({
      model: activeModel,
      messages,
      temperature: 0.25,
      max_tokens: 2500
    });

    const finalAnswer = completion?.choices?.[0]?.message?.content;
    if (!finalAnswer) throw new Error('النموذج لم يقم بتوليد رد مناسب.');

    return res.json({
      answer: finalAnswer,
      language: lang,
      transcription: mediaTranscript || undefined,
      sources: liveSources.map(s => ({ title: s.title, url: s.url, date: s.publishedDate }))
    });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(error.status || 500).json({ error: error.message || 'حدث خطأ أثناء الاتصال بالخادم.' });
  }
});

app.listen(PORT, () => {
  console.log(`⚡ خادم الذكاء العربي الخارق يعمل على المنفذ: ${PORT} ⚡`);
});
