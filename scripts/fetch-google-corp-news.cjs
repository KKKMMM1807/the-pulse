const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

// RSS for Google/Alphabet news
const RSS_URL = 'https://news.google.com/rss/search?q=Alphabet+Inc+OR+Google+AI+OR+Google+Cloud&hl=en-US&gl=US&ceid=US:en';

async function fetchHeadlines(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  const text = await response.text();
  const titles = text.match(/<title>(.*?)<\/title>/g) || [];
  return titles.map(t => t.replace(/<\/?title>/g, '')).slice(1, 15);
}

async function analyzeWithGemini(headlines) {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing");

  const prompt = `Analyze these Google/Alphabet Inc. headlines and provide a summary in 3 bullet points for each language: English, Korean, and Japanese. 
    Focus on AI, Cloud, and Innovation. 
    Also provide a 'sentiment' word (e.g. Bullish, Neutral, Volatile).
    
    Return ONLY JSON:
    {
      "sentiment": "Innovation",
      "updatedAt": "${new Date().toISOString()}",
      "translations": {
        "en": {
          "title": "GOOGLE CORP.",
          "headlines": ["Brief summary 1", "Brief summary 2", "Brief summary 3"],
          "footer": "Updated daily at 08:00 KST"
        },
        "ko": {
          "title": "GOOGLE의 소식은?",
          "headlines": ["요약 1", "요약 2", "요약 3"],
          "footer": "매일 오전 08:00 (KST) 업데이트"
        },
        "ja": {
          "title": "GOOGLEの最新ニュース",
          "headlines": ["要約 1", "要約 2", "要約 3"],
          "footer": "毎日午前 08:00 (KST) 更新"
        }
      }
    }

    Headlines:
    ${headlines.join('\n')}
    `;

  const response = await fetch(GEMINI_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 }
    })
  });

  const data = await response.json();
  if (!data.candidates || !data.candidates[0]) {
    throw new Error(`Gemini Error: ${JSON.stringify(data)}`);
  }
  let textResponse = data.candidates[0].content.parts[0].text;
  textResponse = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(textResponse);
}

async function run() {
  const dataPath = path.join(__dirname, '../public/data');
  if (!fs.existsSync(dataPath)) fs.mkdirSync(dataPath, { recursive: true });

  try {
    console.log("Fetching Google headlines...");
    const headlines = await fetchHeadlines(RSS_URL);
    console.log("Analyzing with Gemini...");
    const result = await analyzeWithGemini(headlines);

    fs.writeFileSync(path.join(dataPath, 'google-news.json'), JSON.stringify(result, null, 2));
    console.log("google-news.json created successfully.");
  } catch (e) {
    console.error("Failed to fetch Google news:", e);
    process.exit(1); // 깃허브 액션에서 ❌ 오류가 뜨도록 강제 종료
  }
}

run();
