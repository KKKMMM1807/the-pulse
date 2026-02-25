const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // Requires GEMINI_API_KEY to be set
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

const COUNTRIES = {
    KR: { name: 'South Korea', url: 'https://news.google.com/rss?ceid=KR:ko&hl=ko' },
    US: { name: 'United States', url: 'https://news.google.com/rss?ceid=US:en&hl=en-US' },
    JP: { name: 'Japan', url: 'https://news.google.com/rss?ceid=JP:ja&hl=ja' },
    CN: { name: 'China', url: 'https://news.google.com/rss?ceid=CN:zh-Hans&hl=zh-CN' },
    UK: { name: 'United Kingdom', url: 'https://news.google.com/rss?ceid=GB:en&hl=en-GB' },
    RU: { name: 'Russia', url: 'https://news.google.com/rss?ceid=RU:ru&hl=ru' },
    DE: { name: 'Germany', url: 'https://news.google.com/rss?ceid=DE:de&hl=de' },
    FR: { name: 'France', url: 'https://news.google.com/rss?ceid=FR:fr&hl=fr' }
};

const MAX_RETRIES = 3;
const SLEEP_MS = 5000;

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchHeadlines(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const text = await response.text();
    const titles = text.match(/<title>(.*?)<\/title>/g) || [];
    return titles.map(t => t.replace(/<\/?title>/g, '')).slice(1, 25); // Get max 24 headlines
}

async function analyzeWithGemini(countryName, headlines, retryCount = 0) {
    if (!GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY environment variable is missing.");
    }

    const prompt = `You are a global mood and sentiment analyzer specializing in country-specific deep analysis. Analyze the following recent news headlines from ${countryName}.

Your task is to identify the single most dominant, specific topic trending right now in ${countryName} and explain it with precision.

CRITICAL RULES FOR THE MAIN WORD:
- The main word must be SPECIFIC and CONCRETE, representing the actual topic (e.g., "부동산", "반도체", "総選挙", "Tariffs", "Strikes"), NOT vague emotional/state words like "갈등", "논란", "분쟁", "Conflict", "Greed", "Panic".
- Choose a word that names THE THING itself, not a feeling about it.

CRITICAL RULES FOR THE REASON/CONTEXT:
- Do NOT start the explanation with "The headlines..." or "헤드라인은..." or "ヘッドラインでは...".
- Start by explaining WHY this specific topic is uniquely relevant to ${countryName} — its political, economic, cultural, or historical context.
- The explanation MUST be deeply tied to ${countryName}'s unique situation. Avoid generic global event descriptions that could apply to any country.
- Separate this from general worldwide events — focus on what makes this particularly significant FOR ${countryName}.

Provide the result STRICTLY as a JSON object, without any markdown formatting like \`\`\`json. 

The JSON structure MUST be exactly as follows:
{
  "mood": "<One of: Panic, Calm, Greed, Innovation, Conflict>",
  "bpm": <A number between 60 and 160 indicating the urgency or pulse of the nation>,
  "color": "<A HEX color code representing the mood and situation>",
  "translations": {
    "en": { 
      "word": "<1 specific English word or short phrase naming the hottest topic (NOT an emotional state word)>", 
      "subTopics": ["<5 related English hashtags/keywords WITHOUT hashtags>"], 
      "reason": "<EXACTLY 4 detailed sentences. Begin by explaining what makes this topic uniquely significant IN ${countryName}'s context. Explain the specific local circumstances, history, or political dynamics driving this issue — not generic global context. Ensure the explanation is comprehensive and provides deep insight, avoiding short or vague sentences. Write in a natural, professional analytical tone.>",
      "country": "${countryName}"
    },
    "ko": { 
      "word": "<1 specific Korean word or short phrase naming the hottest topic. Must be a concrete noun, NOT words like 갈등, 논란, 분쟁, 위기, 혼란>", 
      "subTopics": ["<5 related Korean keywords WITHOUT the # symbol>"], 
      "reason": "<정확히 4개의 상세한 문장으로 작성할 것. '헤드라인은~' 또는 '헤드라인에서~'로 시작하지 말 것. 해당 국가가 왜 이 단어와 연관되는지, ${countryName}의 고유한 정치·경제·사회적 맥락을 중심으로 설명. 전 세계 일반 사건과 분리하여, 이 나라에서만 특별히 주목받는 이유와 구체적 상황을 상세히 기술할 것. 빈 공간이 생기지 않도록 문장마다 충분한 정보와 분석적 깊이를 담을 것. 자연스럽고 부드러운 한국어로, '~나타내고 있습니다.', '~상황입니다.' 와 같이 끝맺을 것.>", 
      "country": "<Korean translation of the country name>" 
    },
    "ja": { 
      "word": "<1 specific Japanese word or short phrase naming the hottest topic. Must be a concrete noun, NOT words like 紛争、갈등 equivalents>", 
      "subTopics": ["<5 related Japanese keywords WITHOUT hashtags>"], 
      "reason": "<EXACTLY 4 detailed sentences in Japanese. Do NOT start with 'ヘッドラインでは'. Begin by explaining why this topic has specific relevance to ${countryName}'s unique context. Focus on country-specific political, economic, or social factors to provide a full and insightfull explanation.>", 
      "country": "<Japanese translation of the country name>" 
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
                generationConfig: { temperature: 0.2, response_mime_type: "application/json" }
            })
        });

        if (!response.ok) {
            let errorText = await response.text();
            throw new Error(`Gemini API Error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const textResponse = data.candidates[0].content.parts[0].text;

        // Ensure valid JSON
        const parsed = JSON.parse(textResponse);
        return parsed;

    } catch (error) {
        console.error(`Attempt ${retryCount + 1} failed for ${countryName}: ${error.message}`);
        if (retryCount < MAX_RETRIES - 1) {
            console.log(`Retrying in 2 seconds...`);
            await sleep(2000);
            return analyzeWithGemini(countryName, headlines, retryCount + 1);
        }
        throw error;
    }
}

async function run() {
    const dataPath = path.join(__dirname, '../public/data');
    if (!fs.existsSync(dataPath)) fs.mkdirSync(dataPath, { recursive: true });

    const results = {};
    // Load existing data ONLY to preserve countries we're NOT analyzing in this run
    // But we are analyzing all of them in COUNTRIES, so results starts empty.

    const nowUTC = new Date();
    // KST is UTC+9
    const nowKST = new Date(nowUTC.getTime() + 9 * 60 * 60 * 1000);
    const kstHour = nowKST.getHours();
    const alignedHour = Math.floor(kstHour / 2) * 2;

    // Create a display-friendly KST date string for filenames
    const kstDate = nowKST.toISOString().split('T')[0]; // YYYY-MM-DD
    const updatedAtISO = new Date(nowKST.setHours(alignedHour, 0, 0, 0)).toISOString();
    const dateStr = `${kstDate}T${String(alignedHour).padStart(2, '0')}-00-00`;

    console.log(`Current Time (KST): ${nowKST.toLocaleString()}`);
    console.log(`Aligned Hour: ${alignedHour}:00`);
    console.log(`Update Timestamp: ${updatedAtISO}`);

    for (const [code, info] of Object.entries(COUNTRIES)) {
        console.log(`\nProcessing ${info.name} (${code})...`);
        try {
            const headlines = await fetchHeadlines(info.url);
            if (headlines.length === 0) {
                console.log(`No headlines found for ${code}. Skipping.`);
                continue;
            }

            console.log(`Fetched ${headlines.length} headlines. Analyzing with Gemini...`);
            const aiResult = await analyzeWithGemini(info.name, headlines);

            const finalData = {
                countryCode: code,
                updatedAt: updatedAtISO,
                ...aiResult
            };

            results[code] = finalData;

            // Save individual latest JSON
            fs.writeFileSync(path.join(dataPath, `${code}.json`), JSON.stringify(finalData, null, 2));

            // Save historical JSON with timestamp
            fs.writeFileSync(path.join(dataPath, `${code}_${dateStr}.json`), JSON.stringify(finalData, null, 2));

            console.log(`Successfully analyzed ${code}. Waiting 5 seconds for rate limits...`);
            await sleep(SLEEP_MS);

        } catch (error) {
            console.error(`Failed to process ${code} after retries:`, error);
            console.log(`Fallback: Using previous data for ${code} if available.`);
            // Automatically handled because we initialized `results` with `existingMoodData`
        }
    }

    // Save combined latest JSON
    fs.writeFileSync(moodJsonPath, JSON.stringify(results, null, 2));
    console.log('\nAll countries processed. Generated mood.json successfully.');
}

if (!GEMINI_API_KEY) {
    console.warn("⚠️  GEMINI_API_KEY environment variable is missing. The script will fail when making API calls.");
    console.warn("Run with: GEMINI_API_KEY=your_key node scripts/analyze-mood.cjs");
}

run();
