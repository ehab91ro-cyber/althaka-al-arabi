النسخة 77 — إصلاح استخراج المصادر وروابط الأخبار
=================================================

مهم جداً:
هذا الملف يحتوي على مقاطع التعديل فقط، وليس ملف server.js كاملاً.
لا تحذف server.js ولا تستبدل محتواه كله بهذا الملف.
احتفظ بنسخة احتياطية، ثم استبدل المقاطع المحددة أدناه فقط.

1) داخل buildSystemPrompt، استبدل قواعد الأخبار الحالية بهذا النص:

const newsRules = isNews ? `
قواعد إضافية إلزامية للأخبار:
- استخدم نتائج Tavily المصنفة كأخبار فقط.
- اعرض فقط النتائج التي اجتازت التحقق البرمجي من التاريخ والصلة والرابط.
- لا تعرض رابط Google أو أي رابط تحويل أو صفحة بحث على أنه المصدر الأصلي.
- لا تخمّن اسم الناشر؛ استخدم اسم النطاق المستخرج من رابط المقال.
- اذكر عنوان الخبر واسم الناشر وتاريخ النشر والرابط الأصلي لكل خبر.
- إذا لم تتوفر نتائج كافية، اذكر العدد المتاح فقط ولا تكمل العدد بأخبار قديمة أو غير مرتبطة.
- لا تصف خبراً بأنه الأحدث ما لم تثبت البيانات ذلك.
` : "";

2) أضف الدوال التالية بعد normalizeText (أو استبدل الدوال التي تحمل الأسماء نفسها):

function getCanonicalArticleUrl(value) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;

    const host = url.hostname.toLowerCase();
    const blockedHosts = [
      "google.com", "www.google.com", "google.", "news.google.com",
      "bing.com", "www.bing.com", "search.yahoo.com"
    ];
    if (blockedHosts.some(item => host === item || host.endsWith("." + item))) {
      return null;
    }

    // لا نقبل روابط التحويل الشائعة.
    if (
      /\/url$/i.test(url.pathname) ||
      /\/redirect/i.test(url.pathname) ||
      url.searchParams.has("url") ||
      url.searchParams.has("redirect") ||
      url.searchParams.has("uddg")
    ) {
      return null;
    }

    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function getPublisherName(value) {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    const known = {
      "reuters.com": "Reuters",
      "apnews.com": "Associated Press",
      "bbc.com": "BBC",
      "bbc.co.uk": "BBC",
      "businesswire.com": "Business Wire",
      "prnewswire.com": "PR Newswire",
      "theguardian.com": "The Guardian",
      "nytimes.com": "The New York Times",
      "aljazeera.net": "الجزيرة",
      "alarabiya.net": "العربية",
      "hespress.com": "هسبريس",
      "skynewsarabia.com": "سكاي نيوز عربية"
    };

    if (known[host]) return known[host];
    const labels = host.split(".");
    return labels.length >= 2 ? labels[labels.length - 2] : host;
  } catch {
    return "";
  }
}

function isRelevantToQuery(item, query) {
  const q = normalizeText(query);
  const haystack = normalizeText(`${item.title || ""} ${item.content || ""}`);

  // للطلبات التي تتعلق بالذكاء الاصطناعي، يجب أن يظهر مفهوم الذكاء الاصطناعي
  // أو أحد مصطلحاته الشائعة في العنوان أو الملخص.
  const aiQuery =
    /الذكاء\s+الاصطناعي|ذكاء\s+اصطناعي|artificial intelligence|machine learning|generative ai|\bai\b/i.test(q);

  if (aiQuery) {
    const aiPatterns = [
      "الذكاء الاصطناعي", "ذكاء اصطناعي", "الذكاء", "الاصطناعي",
      "artificial intelligence", "machine learning",
      "generative ai", " ai ", "نموذج لغوي", "التعلم الآلي"
    ];
    const padded = ` ${haystack} `;
    return aiPatterns.some(term => padded.includes(` ${normalizeText(term)} `) ||
      haystack.includes(normalizeText(term)));
  }

  const stopWords = new Set([
    "ابحث", "بحث", "عن", "في", "من", "على", "الى", "ما", "هي", "هو",
    "اخر", "احدث", "اخبار", "خبر", "خلال", "ساعه", "ساعة", "ساعات",
    "يوم", "اليوم", "منشوره", "منشورة", "اذكر", "اعرض", "عنوان",
    "تاريخ", "النشر", "المصدر", "مصادر", "رابط", "روابط",
    "the", "a", "an", "and", "or", "of", "for", "in", "on", "to",
    "latest", "news", "today", "last", "hours", "hour", "published",
    "show", "find", "search", "sources", "source", "link", "date"
  ]);

  const terms = q.split(" ").filter(word => word.length > 2 && !stopWords.has(word));
  if (!terms.length) return false;

  // اشترط تطابق مصطلحين على الأقل متى كان الطلب يحتوي على مصطلحين أو أكثر.
  const matches = terms.filter(term => haystack.includes(term));
  const required = terms.length >= 2 ? 2 : 1;
  return matches.length >= required;
}

3) استبدل دالة searchTavily الحالية بهذه الدالة:

async function searchTavily(query, isNews) {
  if (!process.env.TAVILY_API_KEY) {
    return { results: [], missingKey: true };
  }

  const requestBody = {
    query,
    search_depth: isNews ? "advanced" : "basic",
    topic: isNews ? "news" : "general",
    max_results: isNews ? 20 : 5,
    include_answer: false,
    include_raw_content: false
  };

  if (isNews) requestBody.days = 1;

  const data = await fetchJson("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.TAVILY_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  const results = Array.isArray(data.results) ? data.results : [];
  const mapped = results.map(item => {
    const originalUrl = getCanonicalArticleUrl(item.url || "");
    return {
      title: String(item.title || "").trim(),
      content: String(item.content || "").trim(),
      url: originalUrl || "",
      published_date: item.published_date || "",
      publisher: originalUrl ? getPublisherName(originalUrl) : "",
      source: "Tavily"
    };
  }).filter(item =>
    item.url &&
    item.title &&
    item.content &&
    item.publisher
  );

  const filtered = isNews
    ? mapped.filter(item =>
        hasVerifiableRecentTimestamp(item.published_date) &&
        isRelevantToQuery(item, query)
      )
    : mapped;

  // إزالة تكرار الروابط.
  const unique = [];
  for (const item of filtered) {
    if (!unique.some(existing => existing.url === item.url)) unique.push(item);
  }

  return { missingKey: false, results: unique };
}

4) داخل gatherKnowledge، استبدل إنشاء كائن sources داخل الحلقة بهذا:

  for (const item of sourceCandidates) {
    if (item.url && !sources.some(source => source.url === item.url)) {
      sources.push({
        title: item.title,
        url: item.url,
        source: item.publisher || item.source,
        published_date: item.published_date || ""
      });
    }
  }

5) استبدل دالة formatKnowledge الحالية بهذه:

function formatKnowledge(results) {
  if (!results.length) return "لم تصل نتائج بحث خارجية مستوفية للشروط لهذه الرسالة.";
  return results.map((item, index) => `
نتيجة ${index + 1}
الناشر: ${item.publisher || item.source || "غير معروف"}
العنوان: ${item.title}
المحتوى: ${item.content}
الرابط الأصلي: ${item.url}
تاريخ النشر: ${item.published_date || "غير متوفر"}
`).join("\n");
}

6) في الجزء الذي يضيف المصادر إلى finalReply، استبدل صياغة المصدر بهذا:

    finalReply += "\n\n**المصادر الأصلية التي اجتازت الفلترة:**\n" +
      knowledge.sources.map(source =>
        `- [${source.title}](${source.url}) — ${source.source || "الناشر غير محدد"}${source.published_date ? " — " + source.published_date : ""}`
      ).join("\n");

ملاحظات فنية:
- اسم الناشر المستخرج من النطاق هو اسم تقريبي عند المواقع غير المدرجة في قائمة الأسماء المعروفة، وليس تحققاً مستقلاً من هوية المؤسسة.
- الكود يرفض روابط Google والتحويلات الظاهرة، لكنه لا يفتح كل صفحة ويب بنفسه ليتحقق من محتواها النهائي. لذلك لا ينبغي وصف هذه الخطوة بأنها تحقق كامل من المقال الأصلي.
- فلترة آخر 24 ساعة تعتمد على published_date الذي يعيده Tavily، وتستبعد النتائج التي لا تحتوي تاريخاً ووقتاً قابلين للتحليل.
- بعد إدخال المقاطع، يجب إجراء فحص صياغة JavaScript واختبار API قبل اعتماد النشر.
