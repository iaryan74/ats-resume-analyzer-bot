# 🤖 ATS Resume Analyzer — Telegram Bot

A smart Telegram bot that evaluates your resume against a Job Description using an **ATS-style scoring system**, provides **actionable feedback**, and generates an **optimized resume**.

## ✨ Features

- **📊 ATS Scoring** — 5-component weighted scoring system (no AI)
- **🔑 Keyword Matching** — Extracts JD keywords and matches against resume
- **📋 Detailed Breakdown** — Keywords, Experience, Projects, Education, Format
- **🎯 ATS Pass Probability** — LOW / MEDIUM / HIGH
- **🤖 AI-Powered Suggestions** — Strengths, gaps, and actionable improvements (Gemini)
- **✨ Resume Optimization** — AI-rewritten resume tailored to the JD (optional)
- **📄 File Support** — PDF, DOCX, and plain text
- **💰 Cost Efficient** — Max 2 AI calls per analysis

---

## 📋 Scoring System

| Component | Weight | Method |
|-----------|--------|--------|
| 🔑 Keywords | 40% | N-gram tokenization + JD keyword matching |
| 💼 Experience | 20% | Section extraction + action verb analysis |
| 🛠 Projects | 15% | JD skill matching in projects section |
| 🎓 Education | 10% | Degree + certification detection |
| 📄 Format | 15% | Headings, bullets, length, contact info |

---


## 💬 Usage

1. Send `/start` to the bot on Telegram
2. Paste or upload a **Job Description** (PDF/DOCX/text)
3. Paste or upload your **Resume** (PDF/DOCX/text)
4. Get your **ATS score**, breakdown, and AI suggestions
5. Reply **Yes** to get an ATS-optimized resume

---

## 📁 Project Structure

```
├── bot.js              # Main bot + conversation flow
├── lib/
│   ├── extractor.js    # PDF/DOCX text extraction
│   ├── scorer.js       # ATS scoring engine (rule-based)
│   ├── insights.js     # Rule-based insights generator
│   └── ai.js           # Gemini AI integration
├── data/
│   └── keywords.js     # 200+ tech keywords & action verbs
├── .env.example        # Environment template
└── package.json
```

---

## 📝 License

MIT
