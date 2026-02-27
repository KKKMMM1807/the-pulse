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
// With 5 countries + 1 Google news = 6 requests per run,
// and 5 runs/day = 30 requests/day → well within 1,500 RPD.
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
const MAX_HEADLINES = 15; // 토큰 수 절약을 위해 15개로 제한

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

async function analyzeWithGemini(countryName, headlines, retryCount = 0) {
    const prompt = `
    Analyze the following headlines from ${countryName} and provide a summary of the current national mood.
    Output MUST be in English only.
    Return ONLY a JSON object with this exact structure:
    {
      "keyword": "A single powerful English adjective or noun representing the mood",
      "hashtags": ["#tag1", "#tag2", "#tag3"],
      "explanation": "A one-sentence emotional explanation of the mood in English",
      "bpm": A number between 40 and 180 representing the intensity of the mood,
      "color": "A hex color code representing the mood (e.g., #FF4444 for intense, #44FF44 for calm, #4444FF for sad)"
    }

    Headlines:
    ${headlines.join('\n')}
    `;

    try {
        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
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
        return parsed;

    } catch (error) {
        console.error(`Attempt ${retryCount + 1} failed for ${countryName}: ${error.message}`);
        if (retryCount < MAX_RETRIES - 1) {
            let waitTime;
            if (error.message.includes('429') || error.message.includes('Quota') || error.message.includes('RESOURCE_EXHAUSTED')) {
                // Rate limit: API가 알려주는 대기 시간을 파싱하거나, 기본 70초 대기
                let retryDelayMatch = error.message.match(/"retryDelay":\s*"(\d+)s"/);
                if (retryDelayMatch && retryDelayMatch[1]) {
                    const delaySec = parseInt(retryDelayMatch[1], 10);
                    waitTime = (delaySec + 5) * 1000; // API 제안 + 5초 여유
                    console.log(`⏳ Rate limit hit. Waiting ${delaySec + 5}s as suggested by API...`);
                } else {
                    waitTime = 70000; // 기본 70초 (쿨다운 주기 ~60초 + 여유)
                    console.log(`⏳ Rate limit hit. Waiting 70s for cooldown...`);
                }
            } else {
                waitTime = 5000;
                console.log(`Retrying in 5 seconds...`);
            }
            await sleep(waitTime);
            return analyzeWithGemini(countryName, headlines, retryCount + 1);
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
    // KST is UTC+9
    const nowKST = new Date(nowUTC.getTime() + 9 * 60 * 60 * 1000);

    // 스케줄 시간 목록 (KST): 0, 8, 12, 16, 20
    const scheduleHours = [0, 8, 12, 16, 20];
    const kstHour = nowKST.getHours();

    // 현재 시간에서 가장 가까운 스케줄 시간 찾기
    let alignedHour = scheduleHours[0];
    for (const h of scheduleHours) {
        if (kstHour >= h) alignedHour = h;
    }

    const kstDate = nowKST.toISOString().split('T')[0]; // YYYY-MM-DD
    const updatedAtDate = new Date(nowKST);
    updatedAtDate.setHours(alignedHour, 0, 0, 0);
    const updatedAtISO = updatedAtDate.toISOString();

    const dateStr = `${kstDate}T${String(alignedHour).padStart(2, '0')}-00-00`;

    console.log(`========================================`);
    console.log(`📡 The Pulse - Mood Analysis`);
    console.log(`========================================`);
    console.log(`Current Time (KST): ${nowKST.toLocaleString()}`);
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
            fs.writeFileSync(path.join(dataPath, `${code}_${dateStr}Z.json`), JSON.stringify(finalData, null, 2));

            console.log(`✅ Successfully analyzed ${code}.`);

            // 마지막 국가가 아니면 65초 대기 (RPM 제한 방지)
            if (i < countryEntries.length - 1) {
                console.log(`⏳ Waiting ${SLEEP_BETWEEN_COUNTRIES_MS / 1000}s before next country (rate limit safety)...`);
                await sleep(SLEEP_BETWEEN_COUNTRIES_MS);
            }

        } catch (error) {
            console.error(`❌ Failed to process ${code} after retries:`, error.message);
            console.log(`↩️  Keeping previous data for ${code}.`);
        }
    }

    // Save combined latest JSON
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
