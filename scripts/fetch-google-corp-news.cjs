const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

// RSS for Google/Alphabet news
const RSS_URL = 'https://news.google.com/rss/search?q=Alphabet+Inc+OR+Google+AI+OR+Google+Cloud&hl=en-US&gl=US&ceid=US:en';

const MAX_RETRIES = 3;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchHeadlines(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  const text = await response.text();
  const titles = text.match(/<title>(.*?)<\/title>/g) || [];
  return titles.map(t => t.replace(/<\/?title>/g, '')).slice(1, 12); // 12개로 제한 (토큰 절약)
}

async function analyzeWithGemini(headlines, retryCount = 0) {
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

  try {
    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 }
      })
    });

    if (!response.ok) {
      let errorText = await response.text();
      throw new Error(`Gemini API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    if (!data.candidates || !data.candidates[0]) {
      throw new Error(`Gemini Error: ${JSON.stringify(data)}`);
    }
    let textResponse = data.candidates[0].content.parts[0].text;
    textResponse = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(textResponse);

  } catch (error) {
    console.error(`Attempt ${retryCount + 1} failed: ${error.message}`);
    if (retryCount < MAX_RETRIES - 1) {
      let waitTime;
      if (error.message.includes('429') || error.message.includes('Quota') || error.message.includes('RESOURCE_EXHAUSTED')) {
        let retryDelayMatch = error.message.match(/"retryDelay":\s*"(\d+)s"/);
        if (retryDelayMatch && retryDelayMatch[1]) {
          const delaySec = parseInt(retryDelayMatch[1], 10);
          waitTime = (delaySec + 5) * 1000;
          console.log(`⏳ Rate limit hit. Waiting ${delaySec + 5}s...`);
        } else {
          waitTime = 70000;
          console.log(`⏳ Rate limit hit. Waiting 70s for cooldown...`);
        }
      } else {
        waitTime = 5000;
        console.log(`Retrying in 5 seconds...`);
      }
      await sleep(waitTime);
      return analyzeWithGemini(headlines, retryCount + 1);
    }
    throw error;
  }
}

async function run() {
  const dataPath = path.join(__dirname, '../public/data');
  if (!fs.existsSync(dataPath)) fs.mkdirSync(dataPath, { recursive: true });

  try {
    console.log("📰 Fetching Google/Alphabet headlines...");
    const headlines = await fetchHeadlines(RSS_URL);
    console.log(`📊 Got ${headlines.length} headlines. Analyzing with Gemini...`);
    const result = await analyzeWithGemini(headlines);

    fs.writeFileSync(path.join(dataPath, 'google-news.json'), JSON.stringify(result, null, 2));
    console.log("✅ google-news.json created successfully.");
  } catch (e) {
    console.error("❌ Failed to fetch Google news:", e.message);
    process.exit(1);
  }
}

if (!GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY environment variable is missing. Exiting.");
  process.exit(1);
}

run();
