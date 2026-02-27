import type { MoodData } from './types';

export const mockMoodData: Record<string, MoodData> = {
    KR: {
        country: 'South Korea',
        countryCode: 'KR',
        mood: 'Innovation',
        word: '반도체',
        subTopics: ['AI', 'D램', '서울'],
        reason: '삼성전자, 차세대 AI 반도체 양산 발표로 시장 주도권 강화 소식에 뉴스테크 섹터 활발',
        bpm: 78,
        color: '#00F260',
        translations: {
            en: { word: 'Semiconductors', subTopics: ['AI', 'DRAM', 'Seoul'], reason: 'Samsung announces next-gen AI chip mass production, strengthening market leadership in tech sector', country: 'South Korea' },
            ko: { word: '반도체', subTopics: ['AI', 'D램', '서울'], reason: '삼성전자, 차세대 AI 반도체 양산 발표로 시장 주도권 강화 소식에 뉴스테크 섹터 활발', country: '대한민국' },
            zh: { word: '半导体', subTopics: ['人工智能', '内存', '首尔'], reason: '三星电子宣布量产下一代AI半导体，加强市场主导地位', country: '韩国' },
        }
    },
    US: {
        country: 'United States',
        countryCode: 'US',
        mood: 'Panic',
        word: 'Wall Street',
        subTopics: ['Market', 'Inflation', 'Fed'],
        reason: 'Wall Street faces sharp decline as unexpected inflation figures resurface panic selling across major indices',
        bpm: 124,
        color: '#FF4B2B',
        translations: {
            en: { word: 'Wall Street', subTopics: ['Market', 'Inflation', 'Fed'], reason: 'Wall Street faces sharp decline as unexpected inflation figures resurface panic selling across major indices', country: 'United States' },
            ko: { word: '월가', subTopics: ['시장', '인플레이션', '연준'], reason: '예상치 못한 인플레이션 수치에 월가 급락, 주요 지수 전반에 공황 매도세 확산', country: '미국' },
            zh: { word: '华尔街', subTopics: ['市场', '通胀', '美联储'], reason: '意外的通胀数据导致华尔街大幅下跌，恐慌性抛售蔓延', country: '美国' },
        }
    },
    RU: {
        country: 'Russia',
        countryCode: 'RU',
        mood: 'Conflict',
        word: 'Sanctions',
        subTopics: ['Geopolitics', 'Energy', 'Trade'],
        reason: 'Escalating geopolitical tensions impact global energy markets and strengthen sanctions.',
        bpm: 112,
        color: '#434343',
        translations: {
            en: { word: 'Sanctions', subTopics: ['Geopolitics', 'Energy', 'Trade'], reason: 'Escalating geopolitical tensions impact global energy markets and strengthen sanctions.', country: 'Russia' },
            ko: { word: '제재', subTopics: ['지정학', '에너지', '무역'], reason: '지정학적 긴장 고조로 글로벌 에너지 시장 영향, 제재 강화', country: '러시아' },
            zh: { word: '制裁', subTopics: ['地缘政治', '能源', '贸易'], reason: '地缘政治紧张局势升级影响全球能源市场并加强制裁', country: '俄罗斯' },
        }
    },
    UK: {
        country: 'United Kingdom',
        countryCode: 'UK',
        mood: 'Conflict',
        word: 'NHS Reform',
        subTopics: ['Policy', 'Healthcare', 'Energy'],
        reason: 'Intense parliamentary debates over new energy policies and healthcare funding reforms',
        bpm: 92,
        color: '#434343',
        translations: {
            en: { word: 'NHS Reform', subTopics: ['Policy', 'Healthcare', 'Energy'], reason: 'Intense parliamentary debates over new energy policies and healthcare funding reforms', country: 'United Kingdom' },
            ko: { word: 'NHS 개혁', subTopics: ['정책', '의료', '에너지'], reason: '새로운 에너지 정책과 의료 재정 개혁에 대한 의회 논쟁 격화', country: '영국' },
            zh: { word: 'NHS改革', subTopics: ['政策', '医疗', '能源'], reason: '围绕新能源政策和医疗资金改革的议会辩论激烈', country: '英国' },
        }
    },
    CN: {
        country: 'China',
        countryCode: 'CN',
        mood: 'Greed',
        word: 'EV Exports',
        subTopics: ['Export', 'EV', 'Tech'],
        reason: 'Electric vehicle exports hit record highs as local manufacturers dominate global markets',
        bpm: 105,
        color: '#FDC830',
        translations: {
            en: { word: 'EV Exports', subTopics: ['Export', 'EV', 'Tech'], reason: 'Electric vehicle exports hit record highs as local manufacturers dominate global markets', country: 'China' },
            ko: { word: 'EV 수출', subTopics: ['수출', '전기차', '기술'], reason: '전기차 수출 사상 최고치, 중국 제조업체 글로벌 시장 지배', country: '중국' },
            zh: { word: '电动车出口', subTopics: ['出口', '电动汽车', '科技'], reason: '电动汽车出口创历史新高，本土制造商主导全球市场', country: '中国' },
        }
    },
};

export const translations = {
    ko: {
        title: '더 펄스',
        subtitle: '지구의 심박수',
        whyThisWord: '왜 이 단어인가요?',
        weekInWords: 'THE WEEK IN 7 WORDS',
        language: '언어',
        theme: '테마',
        bigTechNews: 'BIG TECH NEWS',
        checkout: '결제하기'
    },
    en: {
        title: 'The Pulse',
        subtitle: 'Earth Pulse Rate',
        whyThisWord: 'Why this word?',
        weekInWords: 'THE WEEK IN 7 WORDS',
        language: 'Language',
        theme: 'Theme',
        bigTechNews: 'BIG TECH NEWS',
        checkout: 'Checkout'
    },
    zh: {
        title: '脉搏',
        subtitle: '地球的心跳',
        whyThisWord: '为什么是这个词？',
        weekInWords: 'THE WEEK IN 7 WORDS',
        language: '语言',
        theme: '主题',
        bigTechNews: 'BIG TECH NEWS',
        checkout: '结账'
    }
};
