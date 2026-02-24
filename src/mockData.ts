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
        color: '#00F260'
    },
    US: {
        country: 'United States',
        countryCode: 'US',
        mood: 'Panic',
        word: 'Chaos',
        subTopics: ['Market', 'Inflation', 'Fed'],
        reason: 'Wall Street faces sharp decline as unexpected inflation figures resurface panic selling',
        bpm: 124,
        color: '#FF4B2B'
    },
    JP: {
        country: 'Japan',
        countryCode: 'JP',
        mood: 'Calm',
        word: 'Slow',
        subTopics: ['Tradition', 'Tourism', 'Yen'],
        reason: 'Kyoto sees return to peaceful tourism levels after major local festival seasons end',
        bpm: 58,
        color: '#1A2980'
    },
    RU: {
        country: 'Russia',
        countryCode: 'RU',
        mood: 'Conflict',
        word: 'Tension',
        subTopics: ['Geopolitics', 'Sanctions', 'Energy'],
        reason: 'Escalating geopolitical tensions impact global energy markets and strengthen sanctions.',
        bpm: 112,
        color: '#434343'
    },
    UK: {
        country: 'United Kingdom',
        countryCode: 'UK',
        mood: 'Conflict',
        word: 'Reform',
        subTopics: ['Policy', 'NHS', 'Energy'],
        reason: 'Intense parliamentary debates over new energy policies and healthcare funding reforms',
        bpm: 92,
        color: '#434343'
    },
    CN: {
        country: 'China',
        countryCode: 'CN',
        mood: 'Greed',
        word: 'Growth',
        subTopics: ['Export', 'EV', 'Tech'],
        reason: 'Electric vehicle exports hit record highs as local manufacturers dominate global markets',
        bpm: 105,
        color: '#FDC830'
    },
    DE: {
        country: 'Germany',
        countryCode: 'DE',
        mood: 'Conflict',
        word: 'Strike',
        subTopics: ['Auto', 'Union', 'Economy'],
        reason: 'Major autoworkers strike leads to production halts and widespread economic concerns',
        bpm: 88,
        color: '#434343'
    },
    FR: {
        country: 'France',
        countryCode: 'FR',
        mood: 'Innovation',
        word: 'Green',
        subTopics: ['Climate', 'Paris', 'Energy'],
        reason: 'New comprehensive green energy initiatives announced ahead of major climate summit',
        bpm: 72,
        color: '#00F260'
    }
};

export const translations = {
    ko: {
        title: '더 펄스',
        subtitle: '지구의 심박수',
        whyThisWord: '왜 이 단어인가요?',
        weekInWords: 'THE WEEK IN 7 WORDS',
        language: '언어',
        theme: '테마',
        proMode: 'THE PULSE PRO',
        checkout: '결제하기'
    },
    en: {
        title: 'The Pulse',
        subtitle: 'Earth Pulse Rate',
        whyThisWord: 'Why this word?',
        weekInWords: 'THE WEEK IN 7 WORDS',
        language: 'Language',
        theme: 'Theme',
        proMode: 'THE PULSE PRO',
        checkout: 'Checkout'
    },
    ja: {
        title: 'ザ・パルス',
        subtitle: '地球の心拍数',
        whyThisWord: 'なぜこの言葉？',
        weekInWords: 'THE WEEK IN 7 WORDS',
        language: '言語',
        theme: 'テーマ',
        proMode: 'THE PULSE PRO',
        checkout: 'チェックアウト'
    }
};
