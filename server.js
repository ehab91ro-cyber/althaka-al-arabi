      notices.push(
        "البحث المباشر عبر الإنترنت يحتاج إلى ضبط TAVILY_API_KEY في إعدادات Render."
      );
    }

    return res.json({
      reply: finalReply,
      search_used: knowledge.searchAttempted && knowledge.results.length > 0,
      sources,
      search_notice: notices.length ? notices.join(" ") : null
    });

  } catch (error) {
    console.error(
      "Chat API error:",
      error.stack || error.message
    );

    if (
      error.message &&
      /5 ملفات|3 صور|5 ميغابايت|1 ميغابايت|25 ميغابايت|30 ميغابايت|نوعه غير مدعوم/.test(error.message)
    ) {
      return res.status(400).json({
        error: error.message
      });
    }

    return res.status(500).json({
      error: "تعذر الحصول على إجابة. حاول مرة أخرى."
    });
  }
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    model: MODEL,
    search: {
      wikipedia: true,
      wikidata: true,
      tavily_configured: Boolean(process.env.TAVILY_API_KEY)
    },
    attachments: {
      multipart: true,
      images: true,
      audio_transcription: true,
      text_files: ["txt", "md", "csv", "json"]
    }
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
