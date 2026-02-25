const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

const COUNTRIES = {
    KR: { name: 'South Korea', url: 'https://news.google.com/rss?ceid=KR:ko&hl=ko' },
    US: { name: 'United States', url: 'https://news.google.com/rss?ceid=US:en&hl=en-US' },
    JP: { name: 'Japan', url: 'https://news.google.com/rss?ceid=JP:ja&hl=ja' },
    CN: { name: 'China', url: 'https://news.google.com/rss?ceid=CN:zh-Hans&hl=zh-Hans' },
    UK: { name: 'United Kingdom', url: 'https://news.google.com/rss?ceid=GB:en&hl=en-GB' },
    RU: { name: 'Russia', url: 'https://news.google.com/rss?ceid=RU:ru&hl=ru' },
    DE: { name: 'Germany', url: 'https://news.google.com/rss?ceid=DE:de&hl=de' },
    FR: { name: 'France', url: 'https://news.google.com/rss?ceid=FR:fr&hl=fr' }
};

const SLEEP_MS = 15000; // 기존 5000에서 15초로 늘려 기본적으로 한도에 안 걸리게 조정
const MAX_RETRIES = 3;

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchHeadlines(url) {
    try {
        const response = await fetch(url);
        const text = await response.text();
        const headlines = [];
        const items = text.match(/<item>([\s\S]*?)<\/item>/g) || [];

        for (const item of items.slice(0, 25)) {
            const titleMatch = item.match(/<title>(.*?)<\/title>/);
            if (titleMatch) {
                // Remove source name from title (e.g., "Headline - Source")
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
                // Removed generationConfig to avoid 400 errors
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
            let waitTime = 2000;
            if (error.message.includes('429') || error.message.includes('Quota')) {
                console.log(`Rate limit/Quota exceeded. Waiting 35 seconds to reset...`);
                waitTime = 35000;
            } else {
                console.log(`Retrying in 2 seconds...`);
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

    const results = { ...existingMoodData }; // Preserve existing data by default

    const nowUTC = new Date();
    // KST is UTC+9
    const nowKST = new Date(nowUTC.getTime() + 9 * 60 * 60 * 1000);
    const kstHour = nowKST.getHours();
    const alignedHour = Math.floor(kstHour / 2) * 2;

    const kstDate = nowKST.toISOString().split('T')[0]; // YYYY-MM-DD
    const updatedAtDate = new Date(nowKST);
    updatedAtDate.setHours(alignedHour, 0, 0, 0);
    const updatedAtISO = updatedAtDate.toISOString();

    // Valid filename date string: 2026-02-25T10-00-00
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
            fs.writeFileSync(path.join(dataPath, `${code}_${dateStr}Z.json`), JSON.stringify(finalData, null, 2));

            console.log(`Successfully analyzed ${code}. Waiting 5 seconds for rate limits...`);
            await sleep(SLEEP_MS);

        } catch (error) {
            console.error(`Failed to process ${code} after retries:`, error);
            console.log(`Fallback: Keeping previous data for ${code}.`);
            // results[code] already contains existingMoodData[code] from the spread at start
            process.exitCode = 1; // 깃허브 액션에서 ❌ 오류가 뜨도록 설정
        }
    }

    // Save combined latest JSON
    fs.writeFileSync(moodJsonPath, JSON.stringify(results, null, 2));
    console.log('\nAll countries processed. Generated mood.json successfully.');
}

if (!GEMINI_API_KEY) {
    console.warn("⚠️  GEMINI_API_KEY environment variable is missing. The script will fail when making API calls.");
}

run().catch(err => {
    console.error("Critical error in run():", err);
    process.exit(1);
});
