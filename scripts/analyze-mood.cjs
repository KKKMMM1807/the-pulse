const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

// ===================================================================
// Gemini 2.0 Flash Free Tier Limits (as of 2026):
//   - RPM  (Requests Per Minute):    15
//   - RPD  (Requests Per Day):       1,500
//   - TPM  (Tokens Per Minute):      1,000,000
//   - Cooldown:                      ~60s after exhaustion
//
// With 5 countries + 3 tech news = 8 requests per run,
// and 5 runs/day = 40 requests/day → well within 1,500 RPD.
// With 65s interval between requests, max ~1 request/min → safe for RPM.
// ===================================================================

const COUNTRIES = {
    KR: { name: 'South Korea', url: 'https://news.google.com/rss?ceid=KR:ko&hl=ko' },
    CN: { name: 'China', url: 'https://news.google.com/rss?ceid=CN:zh-Hans&hl=zh-Hans' },
    RU: { name: 'Russia', url: 'https://news.google.com/rss?ceid=RU:ru&hl=ru' },
    US: { name: 'United States', url: 'https://news.google.com/rss?ceid=US:en&hl=en-US' },
    UK: { name: 'United Kingdom', url: 'https://news.google.com/rss?ceid=GB:en&hl=en-GB' }
};

// 65초 대기 → 분당 최대 ~0.9 요청 (RPM 15 한도에 매우 안전)
const SLEEP_BETWEEN_COUNTRIES_MS = 65000;
const MAX_RETRIES = 3;
const MAX_HEADLINES = 15;

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchHeadlines(url) {
    try {
        const response = await fetch(url);
        const text = await response.text();
        const headlines = [];
        const items = text.match(/<item>([\s\S]*?)<\/item>/g) || [];

        for (const item of items.slice(0, MAX_HEADLINES)) {
            const titleMatch = item.match(/<title>(.*?)<\/title>/);
            if (titleMatch) {
                const fullTitle = titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1');
                const cleanTitle = fullTitle.split(' - ')[0];
                headlines.push(cleanTitle);
            }
        }
        return headlines;
    } catch (error) {
        console.error(`Error fetching headlines from ${url}:`, error);
        return [];
    }
}

async function analyzeWithGemini(countryName, countryCode, headlines, retryCount = 0) {
    const prompt = `
    Analyze the following news headlines from ${countryName} and identify the MOST TALKED ABOUT core topic or subject.
    
    CRITICAL RULES:
    1. The "word" field must be a SPECIFIC NOUN or TOPIC that is the core subject of the news (e.g., "Semiconductors", "NATO Summit", "Trade War", "NHS Reform", "EV Exports"), NOT an emotion or mood word (DO NOT use words like "Turbulence", "Resilience", "Disquiet", "Vibrancy").
    2. The "subTopics" must be 3 REAL, SPECIFIC topics from the headlines (e.g., "Samsung", "Interest Rate", "Ukraine"). Do NOT include generic/meta tags like "#RussianMood", "#UKNews", "#NationalChallenges", "#KoreanPolitics". Every topic must be a specific subject matter.
    3. The "reason" explanation must be DETAILED - at least 3-4 sentences explaining why this topic dominates the news, what events led to it, and what the public reaction is. Make it informative and analytical.
    4. Provide translations in English, Korean, AND Chinese (Simplified).

    Return ONLY a valid JSON object with this EXACT structure (no markdown, no code blocks):
    {
      "country": "${countryName}",
      "countryCode": "${countryCode}",
      "mood": "One of: Panic, Calm, Greed, Innovation, Conflict",
      "word": "A specific noun/topic from the news (NOT an emotion word)",
      "subTopics": ["#SpecificTopic1", "#SpecificTopic2", "#SpecificTopic3"],
      "reason": "A DETAILED 3-4 sentence analytical explanation of why this topic is dominating the news, what key events are driving it, how the public is reacting, and what implications it has.",
      "bpm": A number between 40 and 180 representing the intensity of the mood,
      "color": "A hex color code representing the mood",
      "translations": {
        "en": {
          "word": "English topic noun",
          "subTopics": ["Specific Topic 1", "Specific Topic 2", "Specific Topic 3"],
          "reason": "DETAILED English explanation (3-4 sentences). Cover the main events, public reaction, and implications.",
          "country": "${countryName}"
        },
        "ko": {
          "word": "한국어 주제 명사",
          "subTopics": ["구체적 주제 1", "구체적 주제 2", "구체적 주제 3"],
          "reason": "상세한 한국어 설명 (3~4문장). 주요 사건, 여론 반응, 시사점 포함.",
          "country": "해당 국가의 한국어 이름"
        },
        "zh": {
          "word": "中文主题名词",
          "subTopics": ["具体话题1", "具体话题2", "具体话题3"],
          "reason": "详细的中文说明（3-4句话）。涵盖主要事件、公众反应和影响。",
          "country": "该国家的中文名称"
        }
      }
    }

    IMPORTANT EXAMPLES of good vs bad:
    - GOOD word: "NATO Summit", "AI Regulation", "Housing Crisis", "Trade Sanctions"
    - BAD word: "Turbulence", "Resilience", "Disquiet", "Vibrancy"
    - GOOD subTopics: ["#Samsung", "#InterestRate", "#Ukraine"]
    - BAD subTopics: ["#RussianMood", "#UKNews", "#NationalChallenges"]

    Country name translations:
    - "translations.ko.country": "대한민국", "미국", "영국", "중국", "러시아"
    - "translations.zh.country": "韩国", "美国", "英国", "中国", "俄罗斯"

    Return ONLY the JSON object, no extra text.

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

        // Strip markdown code blocks if present
        textResponse = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();

        const parsed = JSON.parse(textResponse);

        // Validate required fields exist
        if (!parsed.translations || !parsed.translations.ko || !parsed.translations.en || !parsed.translations.zh) {
            console.warn(`⚠️  Missing translations for ${countryCode}, adding defaults...`);
            if (!parsed.translations) parsed.translations = {};
            if (!parsed.translations.en) {
                parsed.translations.en = {
                    word: parsed.word || parsed.keyword || 'Unknown',
                    subTopics: parsed.subTopics || parsed.hashtags || [],
                    reason: parsed.reason || parsed.explanation || '',
                    country: countryName
                };
            }
            if (!parsed.translations.ko) {
                parsed.translations.ko = {
                    word: parsed.word || '알 수 없음',
                    subTopics: parsed.subTopics || [],
                    reason: parsed.reason || '',
                    country: countryName
                };
            }
            if (!parsed.translations.zh) {
                parsed.translations.zh = {
                    word: parsed.word || '未知',
                    subTopics: parsed.subTopics || [],
                    reason: parsed.reason || '',
                    country: countryName
                };
            }
        }

        // Ensure top-level fields exist
        if (!parsed.country) parsed.country = countryName;
        if (!parsed.countryCode) parsed.countryCode = countryCode;
        if (!parsed.mood) parsed.mood = 'Calm';
        if (!parsed.word) parsed.word = parsed.keyword || 'Unknown';
        if (!parsed.subTopics) parsed.subTopics = parsed.hashtags || [];
        if (!parsed.reason) parsed.reason = parsed.explanation || '';

        return parsed;

    } catch (error) {
        console.error(`Attempt ${retryCount + 1} failed for ${countryName}: ${error.message}`);
        if (retryCount < MAX_RETRIES - 1) {
            let waitTime;
            if (error.message.includes('429') || error.message.includes('Quota') || error.message.includes('RESOURCE_EXHAUSTED')) {
                let retryDelayMatch = error.message.match(/"retryDelay":\s*"(\d+)s"/);
                if (retryDelayMatch && retryDelayMatch[1]) {
                    const delaySec = parseInt(retryDelayMatch[1], 10);
                    waitTime = (delaySec + 5) * 1000;
                    console.log(`⏳ Rate limit hit. Waiting ${delaySec + 5}s as suggested by API...`);
                } else {
                    waitTime = 70000;
                    console.log(`⏳ Rate limit hit. Waiting 70s for cooldown...`);
                }
            } else {
                waitTime = 5000;
                console.log(`Retrying in 5 seconds...`);
            }
            await sleep(waitTime);
            return analyzeWithGemini(countryName, countryCode, headlines, retryCount + 1);
        }
        throw error;
    }
}

async function run() {
    const dataPath = path.join(__dirname, '../public/data');
    const moodJsonPath = path.join(dataPath, 'mood.json');
    if (!fs.existsSync(dataPath)) fs.mkdirSync(dataPath, { recursive: true });

    let existingMoodData = {};
    if (fs.existsSync(moodJsonPath)) {
        try {
            existingMoodData = JSON.parse(fs.readFileSync(moodJsonPath, 'utf8'));
        } catch (e) {
            console.error("Error reading existing mood.json:", e);
        }
    }

    const results = { ...existingMoodData };

    const nowUTC = new Date();
    const nowKST = new Date(nowUTC.getTime() + 9 * 60 * 60 * 1000);

    // 스케줄 시간 목록 (KST): 0, 8, 12, 16, 20
    const scheduleHours = [0, 8, 12, 16, 20];
    const kstHour = nowKST.getUTCHours();

    let alignedHour = scheduleHours[0];
    for (const h of scheduleHours) {
        if (kstHour >= h) alignedHour = h;
    }

    const kstDate = nowKST.toISOString().split('T')[0];
    const updatedAtDate = new Date(nowKST);
    updatedAtDate.setUTCHours(alignedHour, 0, 0, 0);
    const updatedAtISO = updatedAtDate.toISOString();

    const dateStr = `${kstDate}T${String(alignedHour).padStart(2, '0')}-00-00`;

    console.log(`========================================`);
    console.log(`📡 The Pulse - Mood Analysis`);
    console.log(`========================================`);
    console.log(`Current Time (KST): ${nowKST.toISOString()}`);
    console.log(`Aligned Hour: ${alignedHour}:00 KST`);
    console.log(`Countries: ${Object.keys(COUNTRIES).join(', ')} (${Object.keys(COUNTRIES).length} total)`);
    console.log(`Update Timestamp: ${updatedAtISO}`);
    console.log(`========================================\n`);

    const countryEntries = Object.entries(COUNTRIES);

    for (let i = 0; i < countryEntries.length; i++) {
        const [code, info] = countryEntries[i];
        console.log(`\n[${i + 1}/${countryEntries.length}] Processing ${info.name} (${code})...`);
        try {
            const headlines = await fetchHeadlines(info.url);
            if (headlines.length === 0) {
                console.log(`⚠️  No headlines found for ${code}. Skipping.`);
                continue;
            }

            console.log(`📰 Fetched ${headlines.length} headlines. Analyzing with Gemini...`);
            const aiResult = await analyzeWithGemini(info.name, code, headlines);

            const finalData = {
                ...aiResult,
                countryCode: code,
                updatedAt: updatedAtISO,
            };

            results[code] = finalData;

            fs.writeFileSync(path.join(dataPath, `${code}.json`), JSON.stringify(finalData, null, 2));
            fs.writeFileSync(path.join(dataPath, `${code}_${dateStr}Z.json`), JSON.stringify(finalData, null, 2));

            console.log(`✅ Successfully analyzed ${code}.`);
            console.log(`   mood: ${finalData.mood}, word: ${finalData.word}`);
            console.log(`   ko: ${finalData.translations?.ko?.word}, zh: ${finalData.translations?.zh?.word}`);

            if (i < countryEntries.length - 1) {
                console.log(`⏳ Waiting ${SLEEP_BETWEEN_COUNTRIES_MS / 1000}s before next country (rate limit safety)...`);
                await sleep(SLEEP_BETWEEN_COUNTRIES_MS);
            }

        } catch (error) {
            console.error(`❌ Failed to process ${code} after retries:`, error.message);
            console.log(`↩️  Keeping previous data for ${code}.`);
        }
    }

    // Remove old countries that are no longer tracked
    const trackedCodes = Object.keys(COUNTRIES);
    for (const key of Object.keys(results)) {
        if (!trackedCodes.includes(key)) {
            delete results[key];
            console.log(`🗑️  Removed old country data: ${key}`);
        }
    }

    fs.writeFileSync(moodJsonPath, JSON.stringify(results, null, 2));
    console.log('\n========================================');
    console.log('✅ All countries processed. mood.json updated.');
    console.log('========================================');
}

if (!GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY environment variable is missing. Exiting.");
    process.exit(1);
}

run().catch(err => {
    console.error("Critical error in run():", err);
    process.exit(1);
});
