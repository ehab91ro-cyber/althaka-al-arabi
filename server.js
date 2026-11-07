
// البحث المباشر عبر الإنترنت باستخدام Tavily
async function searchWeb(query, topic = "general") {
  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) {
    return {
      results: [],
      notice: "مفتاح البحث المباشر غير مضبوط في Render."
    };
  }

  if (!query || !query.trim()) {
    return { results: [], notice: null };
  }

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query: query.trim(),
      topic: topic === "news" ? "news" : "general",
      search_depth: "advanced",
      max_results: 8,
      include_answer: false,
      include_raw_content: false
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Tavily Search Error:", errorText);
    throw new Error("تعذر تنفيذ البحث المباشر.");
  }

  const data = await response.json();

  const results = (data.results || [])
    .filter(item =>
      item.title &&
      item.url &&
      item.content &&
      (typeof item.score !== "number" || item.score >= 0.25)
    )
    .map(item => ({
      title: item.title,
      url: item.url,
      content: item.content,
      published_date: item.published_date || null,
      score: item.score ?? null
    }));

  return {
    results,
    notice: results.length
      ? null
      : "لم يتم العثور على مصادر مناسبة للسؤال."
  };
}
