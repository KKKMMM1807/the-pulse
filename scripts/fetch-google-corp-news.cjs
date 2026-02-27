const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

const MAX_RETRIES = 3;
const SLEEP_BETWEEN_MS = 65000; // 65s between API calls for rate limit safety

const TECH_SOURCES = {
  google: {
    name: 'Google/Alphabet',
    rssUrl: 'https://news.google.com/rss/search?q=Alphabet+Inc+OR+Google+AI+OR+Google+Cloud&hl=en-US&gl=US&ceid=US:en',
    outputFile: 'google-news.json',
  },
  elonmusk: {
    name: 'Elon Musk',
    rssUrl: 'https://news.google.com/rss/search?q=Elon+Musk+OR+Tesla+OR+SpaceX+OR+xAI&hl=en-US&gl=US&ceid=US:en',
    outputFile: 'elonmusk-news.json',
  },
  nvidia: {
    name: 'NVIDIA',
    rssUrl: 'https://news.google.com/rss/search?q=NVIDIA+OR+Jensen+Huang+OR+GPU+AI+chip&hl=en-US&gl=US&ceid=US:en',
    outputFile: 'nvidia-news.json',
  },
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchHeadlines(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  const text = await response.text();
  const titles = text.match(/<title>(.*?)<\/title>/g) || [];
  return titles.map(t => t.replace(/<\/?title>/g, '')).slice(1, 12);
}

async function analyzeWithGemini(sourceName, headlines, retryCount = 0) {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing");

  const prompt = `Analyze these ${sourceName} headlines and provide a summary in 3 bullet points for each language: English, Korean, and Chinese (Simplified). 
    Focus on the most important developments, innovations, and business moves.
    Also provide a 'sentiment' word (e.g. Bullish, Neutral, Volatile, Innovation, Growth).
    
    Return ONLY JSON:
    {
      "sentiment": "Innovation",
      "updatedAt": "${new Date().toISOString()}",
      "translations": {
        "en": {
          "title": "${sourceName.toUpperCase()}",
          "headlines": ["Brief summary 1", "Brief summary 2", "Brief summary 3"],
          "footer": "Updated daily at 08:00 KST"
        },
        "ko": {
          "title": "${sourceName} 소식",
          "headlines": ["요약 1", "요약 2", "요약 3"],
          "footer": "매일 오전 08:00 (KST) 업데이트"
        },
        "zh": {
          "title": "${sourceName} 新闻",
          "headlines": ["摘要 1", "摘要 2", "摘要 3"],
          "footer": "每日 08:00 (KST) 更新"
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
      return analyzeWithGemini(sourceName, headlines, retryCount + 1);
    }
    throw error;
  }
}

async function run() {
  const dataPath = path.join(__dirname, '../public/data');
  if (!fs.existsSync(dataPath)) fs.mkdirSync(dataPath, { recursive: true });

  const sourceEntries = Object.entries(TECH_SOURCES);

  for (let i = 0; i < sourceEntries.length; i++) {
    const [key, source] = sourceEntries[i];
    console.log(`\n[${i + 1}/${sourceEntries.length}] 📰 Fetching ${source.name} headlines...`);

    try {
      const headlines = await fetchHeadlines(source.rssUrl);
      console.log(`📊 Got ${headlines.length} headlines. Analyzing with Gemini...`);
      const result = await analyzeWithGemini(source.name, headlines);

      fs.writeFileSync(path.join(dataPath, source.outputFile), JSON.stringify(result, null, 2));
      console.log(`✅ ${source.outputFile} created successfully.`);

      // Wait between API calls (except last one)
      if (i < sourceEntries.length - 1) {
        console.log(`⏳ Waiting ${SLEEP_BETWEEN_MS / 1000}s before next source (rate limit safety)...`);
        await sleep(SLEEP_BETWEEN_MS);
      }
    } catch (e) {
      console.error(`❌ Failed to fetch ${source.name} news:`, e.message);
    }
  }

  console.log('\n========================================');
  console.log('✅ All tech news sources processed.');
  console.log('========================================');
}

if (!GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY environment variable is missing. Exiting.");
  process.exit(1);
}

run();
