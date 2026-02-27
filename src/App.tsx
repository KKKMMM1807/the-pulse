import { useState, useEffect, useMemo } from 'react';
import { Globe } from './components/Globe';
import { PulseWave } from './components/PulseWave';
import { mockMoodData, translations } from './mockData';
import type { Language, Theme, MoodData } from './types';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Moon, Sun, Languages, HeartPulse,
  Calendar,
  X, Check, LogOut, User as UserIcon, Newspaper
} from 'lucide-react';
import { supabase } from './lib/supabase';
import type { User } from '@supabase/supabase-js';

import * as THREE from 'three';

// Country name translations for fallback
const countryNames: Record<string, Record<Language, string>> = {
  KR: { en: 'South Korea', ko: '대한민국', zh: '韩国' },
  US: { en: 'United States', ko: '미국', zh: '美国' },
  UK: { en: 'United Kingdom', ko: '영국', zh: '英国' },
  CN: { en: 'China', ko: '중국', zh: '中国' },
  RU: { en: 'Russia', ko: '러시아', zh: '俄罗斯' },
};

// Guess a Mood category from a keyword
const guessMood = (keyword: string): MoodData['mood'] => {
  const lower = (keyword || '').toLowerCase();
  if (['panic', 'chaos', 'fear', 'crisis', 'turbulence', 'turbulent', 'anxiety', 'shock'].some(w => lower.includes(w))) return 'Panic';
  if (['calm', 'stable', 'peace', 'slow', 'steady', 'resilience', 'resilient'].some(w => lower.includes(w))) return 'Calm';
  if (['greed', 'growth', 'vibrancy', 'vibrant', 'boom', 'surge', 'rally'].some(w => lower.includes(w))) return 'Greed';
  if (['innovation', 'breakthrough', 'tech', 'progress', 'momentum'].some(w => lower.includes(w))) return 'Innovation';
  if (['conflict', 'tension', 'reform', 'strike', 'disquiet', 'unrest', 'division'].some(w => lower.includes(w))) return 'Conflict';
  return 'Calm';
};

// Normalize R2 data (keyword/hashtags/explanation format) to frontend MoodData format
const normalizeCountryData = (code: string, raw: Record<string, unknown>): MoodData => {
  if (raw.word && raw.subTopics && raw.translations) {
    return raw as unknown as MoodData;
  }

  const keyword = (raw.keyword as string) || (raw.word as string) || 'Unknown';
  const hashtags = (raw.hashtags as string[]) || (raw.subTopics as string[]) || [];
  const explanation = (raw.explanation as string) || (raw.reason as string) || '';
  const bpm = (raw.bpm as number) || 80;
  const color = (raw.color as string) || '#00F260';
  const mood = (raw.mood as MoodData['mood']) || guessMood(keyword);
  const updatedAt = raw.updatedAt as string | undefined;

  const names = countryNames[code] || { en: code, ko: code, zh: code };

  return {
    country: names.en,
    countryCode: code,
    mood,
    word: keyword,
    subTopics: hashtags.map((h: string) => h.replace(/^#+/, '')),
    reason: explanation,
    bpm,
    color,
    updatedAt,
    translations: (raw.translations as MoodData['translations']) || {
      en: {
        word: keyword,
        subTopics: hashtags.map((h: string) => h.replace(/^#+/, '')),
        reason: explanation,
        country: names.en,
      },
      ko: {
        word: keyword,
        subTopics: hashtags.map((h: string) => h.replace(/^#+/, '')),
        reason: explanation,
        country: names.ko,
      },
      zh: {
        word: keyword,
        subTopics: hashtags.map((h: string) => h.replace(/^#+/, '')),
        reason: explanation,
        country: names.zh,
      },
    },
  };
};

// Mood label translations per language
const moodLabels: Record<string, Record<Language, string>> = {
  Panic: { ko: '공황', en: 'Panic', zh: '恐慌' },
  Calm: { ko: '안정', en: 'Calm', zh: '平静' },
  Greed: { ko: '탐욕', en: 'Greed', zh: '贪婪' },
  Innovation: { ko: '혁신', en: 'Innovation', zh: '创新' },
  Conflict: { ko: '긴장', en: 'Conflict', zh: '冲突' },
};

// Tech news type
interface TechNewsData {
  sentiment: string;
  updatedAt: string;
  translations: Record<Language, { title: string; headlines: string[]; footer: string }>;
}

// Helper to ensure colors are visible in both dark/light modes
const getAdaptiveColor = (color: string, theme: Theme) => {
  if (!color) return '#ffffff';
  try {
    const c = new THREE.Color(color);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);

    if (theme === 'dark') {
      if (hsl.l < 0.6) hsl.l = 0.65;
      if (hsl.s < 0.4) hsl.s = 0.8;
    } else {
      if (hsl.l > 0.6) hsl.l = 0.45;
      if (hsl.s < 0.4) hsl.s = 0.7;
    }

    c.setHSL(hsl.h, hsl.s, hsl.l);
    return `#${c.getHexString()}`;
  } catch (e) {
    return color;
  }
};

const App: React.FC = () => {
  const [lang, setLang] = useState<Language>(() => (localStorage.getItem('lang') as Language) || 'ko');
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('theme') as Theme) || 'dark');
  const [moodData, setMoodData] = useState<Record<string, MoodData>>(mockMoodData);
  const [selectedCountry, setSelectedCountry] = useState<MoodData>(mockMoodData.KR);
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isTimelineOpen, setIsTimelineOpen] = useState(false);
  const [isTechNewsOpen, setIsTechNewsOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  // Tech news states
  const [googleNews, setGoogleNews] = useState<TechNewsData | null>(null);
  const [elonMuskNews, setElonMuskNews] = useState<TechNewsData | null>(null);
  const [nvidiaNews, setNvidiaNews] = useState<TechNewsData | null>(null);
  const [activeTechTab, setActiveTechTab] = useState<'google' | 'elonmusk' | 'nvidia'>('google');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });
    if (error) console.error('Login error:', error.message);
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) console.error('Logout error:', error.message);
  };

  const adaptiveColor = useMemo(() => getAdaptiveColor(selectedCountry.color, theme), [selectedCountry.color, theme]);

  const t = translations[lang];
  const langMood = selectedCountry.translations?.[lang] || {
    word: selectedCountry.word,
    subTopics: selectedCountry.subTopics,
    reason: selectedCountry.reason,
    country: selectedCountry.country
  };

  // Format the updatedAt timestamp - show CURRENT real time in KST
  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    const year = kst.getUTCFullYear();
    const month = String(kst.getUTCMonth() + 1).padStart(2, '0');
    const day = String(kst.getUTCDate()).padStart(2, '0');
    const hour = String(kst.getUTCHours()).padStart(2, '0');
    const minute = String(kst.getUTCMinutes()).padStart(2, '0');

    if (lang === 'ko') {
      return `${year}년 ${month}월 ${day}일 ${hour}:${minute} KST 기준`;
    } else if (lang === 'zh') {
      return `${year}年${month}月${day}日 ${hour}:${minute} KST`;
    } else {
      return `Updated ${year}-${month}-${day} ${hour}:${minute} KST`;
    }
  };

  useEffect(() => {
    const R2_URL = 'https://pub-60707e2e745d4072acc35b49d96ec426.r2.dev';

    fetch(`${R2_URL}/data/mood.json`)
      .then(res => res.json())
      .then((data: Record<string, Record<string, unknown>>) => {
        const normalized: Record<string, MoodData> = {};
        for (const [code, raw] of Object.entries(data)) {
          // Only include tracked countries
          if (['KR', 'CN', 'RU', 'US', 'UK'].includes(code)) {
            normalized[code] = normalizeCountryData(code, raw);
          }
        }
        setMoodData(normalized);
        if (normalized.KR) {
          setSelectedCountry(normalized.KR);
        }
      })
      .catch(err => {
        console.warn("Using mock data as backup:", err);
      });

    // Fetch all tech news
    fetch(`${R2_URL}/data/google-news.json`)
      .then(res => res.json())
      .then(data => setGoogleNews(data))
      .catch(() => console.warn("Google news not available"));

    fetch(`${R2_URL}/data/elonmusk-news.json`)
      .then(res => res.json())
      .then(data => setElonMuskNews(data))
      .catch(() => console.warn("Elon Musk news not available"));

    fetch(`${R2_URL}/data/nvidia-news.json`)
      .then(res => res.json())
      .then(data => setNvidiaNews(data))
      .catch(() => console.warn("NVIDIA news not available"));
  }, []);

  useEffect(() => {
    document.body.className = theme === 'light' ? 'light-mode' : '';
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('lang', lang);
  }, [lang]);

  const handleCountryClick = (code: string) => {
    if (moodData[code]) {
      setSelectedCountry(moodData[code]);
      setSidebarOpen(true);
    }
  };

  const countries = Object.keys(moodData);

  const getMoodLabel = (mood: string) => {
    return moodLabels[mood]?.[lang] ?? mood;
  };

  // Get the currently active tech news for the modal
  const getActiveTechNews = (): TechNewsData | null => {
    switch (activeTechTab) {
      case 'google': return googleNews;
      case 'elonmusk': return elonMuskNews;
      case 'nvidia': return nvidiaNews;
      default: return null;
    }
  };

  const techTabLabels: Record<string, Record<Language, string>> = {
    google: { en: 'Google', ko: 'Google', zh: 'Google' },
    elonmusk: { en: 'Elon Musk', ko: 'Elon Musk', zh: 'Elon Musk' },
    nvidia: { en: 'NVIDIA', ko: 'NVIDIA', zh: 'NVIDIA' },
  };

  return (
    <div className={`app-container ${theme}`}>
      {/* Background Effects */}
      <div className="bg-glow" style={{ background: `radial-gradient(circle at center, ${adaptiveColor}22 0%, transparent 70%)` }} />

      {/* Header */}
      <header className="glass main-header">
        <div className="logo-section">
          <HeartPulse size={24} color={adaptiveColor} className="pulse-animation" />
          <div className="logo-text">
            <h1>{t.title}</h1>
            <span className="status-badge"><span className="dot" style={{ backgroundColor: adaptiveColor }}></span> LIVE</span>
          </div>
        </div>

        <nav className="country-nav">
          {countries.map(code => (
            <button
              key={code}
              onClick={() => handleCountryClick(code)}
              className={selectedCountry.countryCode === code ? 'active' : ''}
            >
              {code}
            </button>
          ))}
        </nav>

        <div className="header-actions">
          <div className="dropdown">
            <button className="green-btn" onClick={() => setLang(lang === 'ko' ? 'en' : lang === 'en' ? 'zh' : 'ko')}>
              <Languages size={18} /> <span>{lang.toUpperCase()}</span>
            </button>
          </div>
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="theme-toggle green-btn">
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>

          {user ? (
            <div className="user-profile glass">
              {user.user_metadata.avatar_url ? (
                <img src={user.user_metadata.avatar_url} alt="profile" className="avatar" />
              ) : (
                <UserIcon size={18} />
              )}
              <span className="user-email">{user.email?.split('@')[0]}</span>
              <button onClick={handleLogout} className="logout-btn" title="Logout">
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <button onClick={handleGoogleLogin} className="google-login-btn">
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" width="18" />
              <span>Login</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Globe */}
      <Globe
        color={selectedCountry.color}
        moodData={moodData}
        theme={theme}
        onCountryClick={handleCountryClick}
      />

      {/* Hero Stats */}
      <div className="hero-stats">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          key={`${selectedCountry.countryCode}-${lang}`}
          className="mood-title"
        >
          <span className="country-label">{langMood.country}</span>
          <div className="word-and-time">
            <h2 style={{ color: adaptiveColor }}>{langMood.word}</h2>
          </div>
          {selectedCountry.updatedAt && (
            <div className="update-time-row" style={{ marginBottom: '15px' }}>
              <span className="update-time">
                {formatTime(selectedCountry.updatedAt)}
              </span>
            </div>
          )}
          <div className="sub-topics-hero" style={{ color: adaptiveColor }}>
            {langMood.subTopics.map((topic: string) => (
              <span key={topic}>#{topic.replace(/^#+/, '')}</span>
            ))}
          </div>
        </motion.div>
      </div>

      {/* BPM Box (Bottom Left) */}
      <div className="bpm-box glass">
        <PulseWave bpm={selectedCountry.bpm} color={adaptiveColor} />
        <div className="bpm-info">
          <span className="bpm-value">{selectedCountry.bpm}</span>
          <span className="bpm-unit">PULSE RATE</span>
        </div>
      </div>

      {/* Floating Buttons */}
      <div className={`floating-actions ${isSidebarOpen ? 'shifted' : ''}`}>
        <button className="action-btn week-btn" onClick={() => setIsTimelineOpen(true)}>
          <Calendar size={20} />
          <span>{t.weekInWords}</span>
        </button>
        <button
          className="action-btn tech-news-btn"
          onClick={() => setIsTechNewsOpen(true)}
        >
          <Newspaper size={20} />
          <span>BIG TECH NEWS</span>
        </button>
      </div>

      {/* Sidebar Details */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="sidebar-panel glass"
          >
            <button className="close-btn" onClick={() => setSidebarOpen(false)}><X size={24} /></button>

            <div className="sidebar-header">
              <span className="badge" style={{ backgroundColor: `${adaptiveColor}33`, color: adaptiveColor }}>
                {getMoodLabel(selectedCountry.mood)}
              </span>
              <h3>{langMood.country}</h3>
              <div className="big-word" style={{ color: adaptiveColor }}>{langMood.word}</div>
            </div>

            <div className="sidebar-section">
              <h4>TOPICS</h4>
              <div className="topics-grid">
                {langMood.subTopics.map((topic: string) => (
                  <div key={topic} className="topic-card">
                    <Check size={14} /> {topic.replace(/^#+/, '')}
                  </div>
                ))}
              </div>
            </div>

            <div className="sidebar-section">
              <h4>{t.whyThisWord?.toUpperCase()}</h4>
              <p className="full-reason">"{langMood.reason}"</p>
            </div>

            <div className="sidebar-footer">
              <div className="pulse-metric">
                <div className="metric-value">{selectedCountry.bpm} <span>BPM</span></div>
                <div className="metric-bar"><div style={{ width: `${(selectedCountry.bpm / 160) * 100}%`, background: adaptiveColor }}></div></div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Timeline Modal */}
      <AnimatePresence>
        {isTimelineOpen && (
          <div className="modal-overlay" onClick={() => setIsTimelineOpen(false)}>
            <motion.div
              className="timeline-modal glass"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="modal-header">
                <h3>{t.weekInWords}</h3>
                <button onClick={() => setIsTimelineOpen(false)}><X size={24} /></button>
              </div>
              <div className="timeline-grid">
                {[
                  { day: lang === 'ko' ? '6일전' : lang === 'zh' ? '6天前' : '6d ago', words: lang === 'ko' ? ['긴장', '금리', '무역'] : ['Conflict', 'Rates', 'Trade'], isCurrent: false },
                  { day: lang === 'ko' ? '5일전' : lang === 'zh' ? '5天前' : '5d ago', words: lang === 'ko' ? ['탐욕', '상승', '호재'] : ['Greed', 'Rise', 'Bullish'], isCurrent: false },
                  { day: lang === 'ko' ? '4일전' : lang === 'zh' ? '4天前' : '4d ago', words: lang === 'ko' ? ['혁신', 'AI', '발표'] : ['Innovation', 'AI', 'Launch'], isCurrent: false },
                  { day: lang === 'ko' ? '3일전' : lang === 'zh' ? '3天前' : '3d ago', words: lang === 'ko' ? ['패닉', '하락', '매도'] : ['Panic', 'Drop', 'Sell'], isCurrent: false },
                  { day: lang === 'ko' ? '그제' : lang === 'zh' ? '前天' : '2d ago', words: lang === 'ko' ? ['안정', '균형', '유지'] : ['Calm', 'Balance', 'Steady'], isCurrent: false },
                  { day: lang === 'ko' ? '어제' : lang === 'zh' ? '昨天' : '1d ago', words: lang === 'ko' ? ['안정', '회복', '지표'] : ['Calm', 'Recovery', 'Index'], isCurrent: false },
                  { day: lang === 'ko' ? '오늘' : lang === 'zh' ? '今天' : 'Today', words: [langMood.word, ...langMood.subTopics.slice(0, 2)], isCurrent: true },
                ].map(({ day, words, isCurrent }) => (
                  <div key={day} className="timeline-item">
                    <span className="day" style={isCurrent ? { color: selectedCountry.color, opacity: 1 } : {}}>{day}</span>
                    <div className="words-stack">
                      {words.map((w, idx) => (
                        <div
                          key={idx}
                          className="word-bubble glass"
                          style={isCurrent ? { borderColor: selectedCountry.color, color: selectedCountry.color, fontWeight: 900 } : { opacity: 0.8 - idx * 0.2 }}
                        >
                          {w}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* BIG TECH NEWS Modal */}
      <AnimatePresence>
        {isTechNewsOpen && (
          <div className="modal-overlay" onClick={() => setIsTechNewsOpen(false)}>
            <motion.div
              className="tech-news-modal glass"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="modal-header">
                <h3>BIG TECH NEWS</h3>
                <button onClick={() => setIsTechNewsOpen(false)}><X size={24} /></button>
              </div>

              {/* Tabs */}
              <div className="tech-tabs">
                {(['google', 'elonmusk', 'nvidia'] as const).map(tab => (
                  <button
                    key={tab}
                    className={`tech-tab ${activeTechTab === tab ? 'active' : ''}`}
                    onClick={() => setActiveTechTab(tab)}
                  >
                    {techTabLabels[tab][lang]}
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="tech-news-content">
                {(() => {
                  const news = getActiveTechNews();
                  if (!news || !news.translations?.[lang]) {
                    return (
                      <div className="tech-no-data">
                        <p>{lang === 'ko' ? '데이터를 불러오는 중...' : lang === 'zh' ? '正在加载数据...' : 'Loading data...'}</p>
                      </div>
                    );
                  }
                  const t = news.translations[lang];
                  return (
                    <>
                      <div className="tech-news-header">
                        <span className="tech-source">{t.title}</span>
                        <span className="tech-sentiment" style={{ color: '#FDC830' }}>{news.sentiment}</span>
                      </div>
                      <ul className="tech-news-list">
                        {t.headlines.map((hl, i) => (
                          <li key={i}>{hl}</li>
                        ))}
                      </ul>
                      <div className="tech-footer">{t.footer}</div>
                    </>
                  );
                })()}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer Hits Badge */}
      <div className="footer-hits">
        <a href="https://hits.seeyoufarm.com">
          <img src="https://hits.seeyoufarm.com/api/count/incr/badge.svg?url=https%3A%2F%2Fthepulse.app&count_bg=%2300F260&title_bg=%23111111&icon=&icon_color=%23E7E7E7&title=hits&edge_flat=false" alt="Hits" />
        </a>
      </div>

      <style>{`
        .app-container {
          width: 100vw;
          height: 100vh;
          overflow: hidden;
          position: relative;
        }
        .bg-glow {
          position: fixed;
          inset: 0;
          z-index: -1;
          transition: background 1s ease;
        }

        .main-header {
          position: fixed;
          top: 20px;
          left: 20px;
          right: 20px;
          height: 70px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 30px;
          z-index: 1000;
          border-radius: 20px;
        }

        .logo-section {
          display: flex;
          align-items: center;
          gap: 15px;
        }
        .logo-text h1 {
          font-size: 1.2rem;
          font-weight: 800;
          letter-spacing: -0.5px;
        }
        .status-badge {
          font-size: 10px;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 5px;
          opacity: 0.6;
        }
        .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }

        .country-nav {
          display: flex;
          gap: 10px;
          background: rgba(0,0,0,0.2);
          padding: 5px;
          border-radius: 30px;
        }
        .country-nav button {
          padding: 6px 15px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 700;
          color: rgba(255,255,255,0.4);
        }
        .country-nav button.active {
          background: white;
          color: black;
        }
        .light-mode .country-nav button.active {
          background: #333;
          color: white;
        }

        .header-actions {
          display: flex;
          gap: 15px;
          align-items: center;
        }
        .header-actions button {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 600;
        }
        .green-btn {
          background-color: #00F260 !important;
          color: black !important;
          border: none;
          border-radius: 8px;
          padding: 8px 12px;
          box-shadow: 0 0 10px rgba(0,242,96,0.3);
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .green-btn:hover {
          transform: scale(1.05);
          box-shadow: 0 0 15px rgba(0,242,96,0.6);
        }

        .hero-stats {
          position: fixed;
          top: 150px;
          left: 60px;
          z-index: 10;
          pointer-events: none;
          max-width: 420px;
        }
        .country-label {
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 2px;
          opacity: 0.6;
          text-transform: uppercase;
        }
        .word-and-time {
          display: flex;
          align-items: baseline;
          gap: 14px;
          flex-wrap: wrap;
        }
        .mood-title h2 {
          font-size: 5.5rem;
          font-weight: 900;
          line-height: 0.9;
          margin: 10px 0;
          text-transform: uppercase;
          white-space: nowrap;
          word-break: keep-all;
        }
        .update-time {
          opacity: 0.5;
          font-size: 13px;
          font-weight: 600;
          white-space: nowrap;
        }
        .sub-topics-hero {
          display: flex;
          gap: 15px;
          font-size: 1.1rem;
          font-weight: 600;
          opacity: 0.8;
          flex-wrap: nowrap;
          overflow: visible;
          white-space: nowrap;
        }
        .sub-topics-hero span {
          white-space: nowrap;
        }

        .words-stack {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .floating-actions {
          position: fixed;
          bottom: 40px;
          right: 40px;
          display: flex;
          flex-direction: column;
          gap: 15px;
          z-index: 100;
          transition: right 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .floating-actions.shifted {
          right: 560px;
        }
        .action-btn {
          padding: 14px 28px;
          border-radius: 30px;
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 13px;
          font-weight: 700;
          min-width: 200px;
          justify-content: center;
        }
        .week-btn {
          background: #00F260 !important;
          color: black !important;
          border: none;
          box-shadow: 0 0 14px rgba(0,242,96,0.4);
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .week-btn:hover {
          transform: scale(1.04);
          box-shadow: 0 0 22px rgba(0,242,96,0.7);
        }
        .tech-news-btn {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
          color: white !important;
          border: none;
          transition: transform 0.2s, box-shadow 0.2s;
          box-shadow: 0 0 14px rgba(102,126,234,0.4);
        }
        .tech-news-btn:hover {
          transform: scale(1.04);
          box-shadow: 0 0 22px rgba(102,126,234,0.7);
        }

        .bpm-box {
          position: fixed;
          bottom: 40px;
          left: 40px;
          padding: 15px 20px;
          border-radius: 20px;
          display: flex;
          align-items: center;
          gap: 15px;
          z-index: 100;
          min-width: 140px;
        }
        .bpm-info {
          display: flex;
          flex-direction: column;
          line-height: 1.1;
        }
        .bpm-value {
          font-size: 24px;
          font-weight: 950;
          letter-spacing: -1px;
        }
        .bpm-unit {
          font-size: 9px;
          font-weight: 800;
          opacity: 0.5;
          letter-spacing: 1px;
        }

        /* Sidebar */
        .sidebar-panel {
          position: fixed;
          right: 40px;
          top: 110px;
          bottom: 40px;
          width: 500px;
          border-radius: 30px;
          padding: 45px;
          z-index: 1100;
          display: flex;
          flex-direction: column;
          overflow-y: auto;
          box-shadow: 0 20px 50px rgba(0,0,0,0.3);
          border: 1px solid rgba(255,255,255,0.1);
        }
        .light-mode .sidebar-panel {
          border: 1px solid rgba(0,0,0,0.05);
          box-shadow: 0 20px 50px rgba(0,0,0,0.1);
        }
        .close-btn {
          position: absolute;
          top: 25px;
          right: 25px;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.1);
          color: white;
          opacity: 0.7;
          border: none;
          transition: all 0.2s;
          cursor: pointer;
        }
        .close-btn:hover {
          opacity: 1;
          background: rgba(255, 255, 255, 0.2);
          transform: rotate(90deg);
        }
        .light-mode .close-btn {
          background: rgba(0, 0, 0, 0.05);
          color: black;
        }
        .sidebar-header {
          padding-right: 30px;
        }
        .badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 1px;
          margin-bottom: 8px;
        }
        .big-word {
          font-size: 3.2rem;
          font-weight: 950;
          line-height: 1;
          margin-top: 6px;
          word-break: keep-all;
        }
        .sidebar-section {
          margin-top: 32px;
        }
        .sidebar-section h4 {
          font-size: 11px;
          letter-spacing: 2px;
          opacity: 0.5;
          margin-bottom: 16px;
        }
        .topics-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .topic-card {
          background: rgba(255,255,255,0.05);
          padding: 12px;
          border-radius: 12px;
          font-size: 13px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .full-reason {
          font-size: 14px;
          line-height: 1.7;
          opacity: 0.85;
        }

        .sidebar-footer {
          margin-top: auto;
          padding-top: 24px;
        }
        .pulse-metric {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .metric-value {
          font-size: 28px;
          font-weight: 950;
          letter-spacing: -1px;
        }
        .metric-value span {
          font-size: 14px;
          opacity: 0.5;
        }

        /* Google Login Styles */
        .google-login-btn {
          display: flex;
          align-items: center;
          gap: 10px;
          background: white !important;
          color: black !important;
          padding: 8px 16px;
          border-radius: 12px;
          font-weight: 700;
          font-size: 14px;
          border: none;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .google-login-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 15px rgba(255, 255, 255, 0.2);
        }
        .user-profile {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 6px 12px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .avatar {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .user-email {
          font-size: 13px;
          font-weight: 600;
          opacity: 0.8;
        }
        .logout-btn {
          background: transparent;
          border: none;
          color: white;
          opacity: 0.5;
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          transition: opacity 0.2s, transform 0.2s;
        }
        .logout-btn:hover {
          opacity: 1;
          color: #ff4b2b;
          transform: scale(1.1);
        }
        .light-mode .user-profile {
          background: rgba(0, 0, 0, 0.05);
          border: 1px solid rgba(0, 0, 0, 0.1);
        }
        .light-mode .user-email, .light-mode .logout-btn {
          color: black;
        }
        .metric-bar {
          height: 4px;
          background: rgba(255,255,255,0.1);
          border-radius: 2px;
          overflow: hidden;
        }
        .metric-bar > div {
          height: 100%;
          border-radius: 2px;
          transition: width 0.5s ease;
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.8);
          backdrop-filter: blur(5px);
          z-index: 2000;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .timeline-modal {
          width: 90%;
          max-width: 1000px;
          padding: 40px;
          border-radius: 30px;
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 40px;
        }
        .modal-header button {
          color: white;
          opacity: 0.6;
          transition: opacity 0.2s;
        }
        .modal-header button:hover {
          opacity: 1;
        }
        .light-mode .modal-header button {
          color: black;
        }
        .timeline-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 15px;
        }
        .timeline-item {
          text-align: center;
        }
        .day {
          display: block;
          font-size: 12px;
          font-weight: 800;
          opacity: 0.5;
          margin-bottom: 10px;
        }
        .word-bubble {
          height: auto;
          min-height: 100px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 20px;
          padding: 10px;
          font-size: 14px;
          font-weight: 800;
          text-transform: uppercase;
          transition: transform 0.3s ease;
          text-align: center;
          word-break: keep-all;
        }
        .word-bubble:hover {
          transform: scale(1.05);
        }

        /* BIG TECH NEWS Modal */
        .tech-news-modal {
          width: 90%;
          max-width: 700px;
          padding: 40px;
          border-radius: 30px;
          max-height: 80vh;
          overflow-y: auto;
        }
        .tech-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 24px;
          background: rgba(255,255,255,0.05);
          padding: 4px;
          border-radius: 16px;
        }
        .tech-tab {
          flex: 1;
          padding: 10px 16px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 700;
          color: rgba(255,255,255,0.5);
          transition: all 0.2s;
          border: none;
          background: transparent;
          cursor: pointer;
        }
        .tech-tab.active {
          background: linear-gradient(135deg, #667eea, #764ba2);
          color: white;
          box-shadow: 0 4px 12px rgba(102,126,234,0.3);
        }
        .tech-tab:hover:not(.active) {
          color: rgba(255,255,255,0.8);
        }
        .light-mode .tech-tab {
          color: rgba(0,0,0,0.4);
        }
        .light-mode .tech-tab.active {
          color: white;
        }
        .tech-news-content {
          min-height: 200px;
        }
        .tech-news-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }
        .tech-source {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 1.5px;
          opacity: 0.6;
          text-transform: uppercase;
        }
        .tech-sentiment {
          font-size: 11px;
          font-weight: 950;
        }
        .tech-news-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .tech-news-list li {
          font-size: 14px;
          line-height: 1.6;
          opacity: 0.85;
          position: relative;
          padding-left: 16px;
          padding: 14px 14px 14px 28px;
          background: rgba(255,255,255,0.03);
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.06);
        }
        .tech-news-list li::before {
          content: '•';
          position: absolute;
          left: 12px;
          color: #667eea;
          font-weight: bold;
        }
        .tech-footer {
          margin-top: 16px;
          font-size: 10px;
          opacity: 0.4;
          font-weight: 600;
        }
        .tech-no-data {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 200px;
          opacity: 0.5;
          font-style: italic;
        }

        .footer-hits {
          position: fixed;
          bottom: 10px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 100;
          opacity: 0.7;
          transition: opacity 0.3s;
        }
        .footer-hits:hover {
          opacity: 1;
        }

        /* Light mode overrides */
        .light-mode .country-nav button {
          color: rgba(0,0,0,0.4);
        }
        .light-mode .week-btn {
          color: black !important;
        }
        .light-mode .modal-overlay {
          background: rgba(255, 255, 255, 0.8);
        }
        .light-mode .timeline-modal,
        .light-mode .tech-news-modal {
          background: rgba(255, 255, 255, 0.9);
          border: 1px solid rgba(0,0,0,0.1);
        }
      `}</style>
    </div>
  );
};

export default App;
