'use strict';

const express = require('express');
const OpenAI = require('openai');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const dns = require('dns').promises;
const net = require('net');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10mb' }));

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');

// التأكد من وجود مجلد الواجهة الأمامية تلقائياً
if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

// إنشاء ملف الواجهة الأمامية HTML تلقائياً
const HTML_CONTENT = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>الذكاء العربي الخارق 3.0</title>
    <link href="https://cloudflare.com" rel="stylesheet">
    <style>
        :root {
            --bg-main: #0b0f19;
            --bg-card: #151d30;
            --accent: #00ffcc;
            --text-main: #f3f4f6;
            --text-muted: #9ca3af;
        }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: var(--bg-main);
            color: var(--text-main);
            margin: 0;
            display: flex;
            flex-direction: column;
            height: 100vh;
        }
        header {
            background-color: var(--bg-card);
            padding: 15px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #23314f;
        }
        h1 { margin: 0; font-size: 1.5rem; color: var(--accent); }
        .chat-container {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 15px;
        }
        .message {
            max-width: 80%;
            padding: 12px 18px;
            border-radius: 12px;
            line-height: 1.6;
            position: relative;
            white-space: pre-wrap;
        }
        .user-message {
            background-color: #1e293b;
            align-self: flex-start;
            border-right: 4px solid var(--accent);
        }
        .ai-message {
            background-color: var(--bg-card);
            align-self: flex-end;
            border-left: 4px solid #3b82f6;
            padding-left: 40px;
        }
        .copy-btn {
            position: absolute;
            top: 8px;
            left: 8px;
            background: none;
            border: none;
            color: var(--text-muted);
            cursor: pointer;
            font-size: 1rem;
            transition: color 0.2s;
        }
        .copy-btn:hover { color: var(--accent); }
        .input-area {
            background-color: var(--bg-card);
            padding: 15px;
            display: flex;
            flex-direction: column;
            gap: 10px;
            border-top: 1px solid #23314f;
        }
        .input-row { display: flex; gap: 10px; align-items: center; }
        textarea {
            flex: 1;
            background-color: #0b0f19;
            border: 1px solid #23314f;
            border-radius: 8px;
            color: white;
            padding: 10px;
            resize: none;
            height: 45px;
        }
        .btn {
            background-color: #374151;
            color: white;
            border: none;
            padding: 12px 20px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: bold;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .btn:hover { background-color: #4b5563; }
        .accent-btn { background-color: var(--accent); color: #0b0f19; }
        .accent-btn:hover { background-color: #00cc99; }
        .stats-bar { font-size: 0.85rem; color: var(--text-muted); display: flex; gap: 15px; }
        .file-indicator { font-size: 0.8rem; color: var(--accent); display: none; margin-bottom: 5px; }
    </style>
</head>
<body>

<header>
    <h1><i class="fa-solid fa-brain"></i> الذكاء العربي الخارق 3.0</h1>
    <div class="stats-bar">
        <span id="speedTimer">سرعة الاستجابة: -- ثانية</span>
    </div>
</header>

<div class="chat-container" id="chatBox">
    <div class="message ai-message">
        <span>مرحباً بك! أنا الذكاء العربي الخارق، تم تصميمي وتطويري بالكامل بمساعدة العبقري إيهاب عادل شالاتي. كيف يمكنني مساعدتك اليوم بمعلومات حية وسريعة للغاية؟</span>
        <button class="copy-btn" onclick="copyText(this)"><i class="fa-regular fa-copy"></i></button>
    </div>
</div>

<div class="input-area">
    <div id="fileIndicator" class="file-indicator"></div>
    <div class="input-row">
        <label class="btn"><i class="fa-solid fa-paperclip"></i> ملفات/صور <input type="file" id="fileInput" multiple style="display:none;" onchange="updateIndicator()"></label>
        <label class="btn"><i class="fa-solid fa-video"></i> فيديو/صوت <input type="file" id="videoInput" accept="video/*,audio/*" style="display:none;" onchange="updateIndicator()"></label>
        <textarea id="userInput" placeholder="اكتب سؤالك هنا لمعلومات حية دقيقة خلال 24 ساعة الماضية..."></textarea>
        <button class="btn accent-btn" id="sendBtn" onclick="sendMessage()"><i class="fa-solid fa-paper-plane"></i> إرسال</button>
    </div>
</div>

<script>
    let chatHistory = [];

    function updateIndicator() {
        const fileInput = document.getElementById('fileInput');
        const videoInput = document.getElementById('videoInput');
        const indicator = document.getElementById('fileIndicator');
        let text = [];
        if(fileInput.files.length) text.push('📂 ' + fileInput.files.length + ' ملفات جاهزة');
        if(videoInput.files.length) text.push('🎬 ملف وسائط جاهز');
        
        if(text.length) {
            indicator.innerText = text.join(' | ');
            indicator.style.display = 'block';
        } else {
            indicator.style.display = 'none';
        }
    }

    async function sendMessage() {
        const text = document.getElementById('userInput').value.trim();
        const fileInput = document.getElementById('fileInput');
        const videoInput = document.getElementById('videoInput');
        
        if(!text && !fileInput.files.length && !videoInput.files.length) return;

        appendMessage(text || "[تحميل وتحليل الوسائط المرفقة...]", 'user-message');
        document.getElementById('userInput').value = '';

        const formData = new FormData();
        if(text) formData.append('message', text);
        formData.append('history', JSON.stringify(chatHistory));

        if(fileInput.files.length) {
            for(let i=0; i<fileInput.files.length; i++) formData.append('files', fileInput.files[i]);
        }
        if(videoInput.files.length) {
            const file = videoInput.files[0];
            if (file.type.startsWith('video/')) {
                formData.append('video', file);
            } else {
                formData.append('audio', file);
            }
        }

        const startTime = performance.now();
        document.getElementById('speedTimer').innerText = "جاري الاستدعاء والبحث الخارق...";

        try {
            const response = await fetch('/api/chat', { method: 'POST', body: formData });
            const data = await response.json();
            
            const endTime = performance.now();
            const inferenceTime = ((endTime - startTime) / 1000).toFixed(2);
            document.getElementById('speedTimer').innerText = 'سرعة الاستجابة: ' + inferenceTime + ' ثانية';

            if(data.answer) {
                appendMessage(data.answer, 'ai-message');
                chatHistory.push({ role: 'user', content: text || "[وسائط]" });
                chatHistory.push({ role: 'assistant', content: data.answer });
            } else if(data.error) {
                appendMessage("خطأ من الخادم: " + data.error, 'ai-message');
            } else {
                appendMessage("خطأ: تعذر الحصول على رد مناسب.", 'ai-message');
            }
        } catch (err) {
            appendMessage("حدث خطأ أثناء الاتصال بالخادم الفوري.", 'ai-message');
        }

        fileInput.value = '';
        videoInput.value = '';
        updateIndicator();
    }

    function appendMessage(text, className) {
        const chatBox = document.getElementById('chatBox');
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message ' + className;
        
        const textSpan = document.createElement('span');
        textSpan.innerText = text;
        msgDiv.appendChild(textSpan);

        if(className === 'ai-message') {
            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-btn';
            copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i>';
            copyBtn.onclick = function() { copyText(this); };
            msgDiv.appendChild(copyBtn);
        }

        chatBox.appendChild(msgDiv);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    function copyText(button) {
        const text = button.parentElement.querySelector('span').innerText.trim();
        navigator.clipboard.writeText(text).then(() => {
            button.innerHTML = '<i class="fa-solid fa-check" style="color: #00ffcc;"></i>';
            setTimeout(() => { button.innerHTML = '<i class="fa-regular fa-copy"></i>'; }, 2000);
        });
    }
</script>
</body>
</html>`;

fs.writeFileSync(path.join(PUBLIC_DIR, 'index.html'), HTML_CONTENT, 'utf8');
app.use(express.static(PUBLIC_DIR));

// الإعدادات والنماذج الحية المتطورة لـ Groq
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const VISION_MODEL = process.env.GROQ_VISION_MODEL || 'llama-3.2-11b-vision-preview';
