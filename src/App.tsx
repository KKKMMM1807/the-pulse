import { useState, useEffect, useMemo } from 'react';
import { Globe } from './components/Globe';
import { PulseWave } from './components/PulseWave';
import { mockMoodData, translations } from './mockData';
import type { Language, Theme, MoodData } from './types';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Moon, Sun, Languages, ArrowUpRight, HeartPulse,
  Calendar,
  X, Check, LogOut, User as UserIcon
} from 'lucide-react';
import { supabase } from './lib/supabase';
import type { User } from '@supabase/supabase-js';

import * as THREE from 'three';

// Mood label translations per language
const moodLabels: Record<string, Record<Language, string>> = {
  Panic: { ko: '공황', en: 'Panic', ja: 'パニック' },
  Calm: { ko: '안정', en: 'Calm', ja: '落ち着き' },
  Greed: { ko: '탐욕', en: 'Greed', ja: '強欲' },
  Innovation: { ko: '혁신', en: 'Innovation', ja: 'イノベーション' },
  Conflict: { ko: '긴장', en: 'Conflict', ja: '緊張' },
};

// Helper to ensure colors are visible in both dark/light modes
const getAdaptiveColor = (color: string, theme: Theme) => {
  if (!color) return '#ffffff';
  try {
    const c = new THREE.Color(color);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);

    if (theme === 'dark') {
      // In dark mode, ensure lightness is at least 0.65 for high contrast
      if (hsl.l < 0.6) hsl.l = 0.65;
      if (hsl.s < 0.4) hsl.s = 0.8; // Boost saturation
    } else {
      // In light mode, ensure it's not too pale
      if (hsl.l > 0.6) hsl.l = 0.45;
      if (hsl.s < 0.4) hsl.s = 0.7; // Ensure vibrancy
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
  const [googleNews, setGoogleNews] = useState<{
    sentiment: string,
    updatedAt: string,
    translations: Record<Language, { title: string, headlines: string[], footer: string }>
  } | null>(null);
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isTimelineOpen, setIsTimelineOpen] = useState(false);
  const [isProMode, setIsProMode] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    // Listen for auth changes
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

  // Format the updatedAt timestamp according to KST-aligned 2-hour slots
  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    // Parse the ISO string and display in KST (UTC+9)
    const d = new Date(isoString);
    // Add 9 hours to get KST
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    const year = kst.getUTCFullYear();
    const month = String(kst.getUTCMonth() + 1).padStart(2, '0');
    const day = String(kst.getUTCDate()).padStart(2, '0');
    const hour = String(kst.getUTCHours()).padStart(2, '0');
    const minute = String(kst.getUTCMinutes()).padStart(2, '0');

    if (lang === 'ko') {
      return `${year}년 ${month}월 ${day}일 ${hour}:${minute} 기준`;
    } else if (lang === 'ja') {
      return `${year}年${month}月${day}日 ${hour}:${minute} 現在`;
    } else {
      return `Updated ${year}-${month}-${day} ${hour}:${minute} KST`;
    }
  };

  // Compute the next update time based on PRO or FREE tier
  const getNextUpdateMessage = () => {
    // Current KST time
    const nowUTC = new Date();
    const nowKSTMs = nowUTC.getTime() + 9 * 60 * 60 * 1000;
    const nowKST = new Date(nowKSTMs);
    const kstHour = nowKST.getUTCHours();
    const intervalHours = isProMode ? 2 : 4;
    const nextSlot = (Math.floor(kstHour / intervalHours) + 1) * intervalHours;
    const nextHour = nextSlot % 24;

    if (lang === 'ko') return `다음 업데이트: ${String(nextHour).padStart(2, '0')}:00 (KST) · ${isProMode ? 'PRO 2시간' : '무료 4시간'} 주기`;
    if (lang === 'ja') return `次の更新: ${String(nextHour).padStart(2, '0')}:00 (KST) · ${isProMode ? 'PRO 2時間' : '無料 4時間'}周期`;
    return `Next update: ${String(nextHour).padStart(2, '0')}:00 KST · ${isProMode ? 'PRO 2hr' : 'Free 4hr'} cycle`;
  };

  useEffect(() => {
    const R2_URL = 'https://pub-60707e2e745d4072acc35b49d96ec426.r2.dev';

    fetch(`${R2_URL}/data/mood.json`)
      .then(res => res.json())
      .then(data => {
        setMoodData(data);
        if (data.KR) {
          setSelectedCountry(data.KR);
        }
      })
      .catch(err => {
        console.warn("Using mock data as backup:", err);
      });

    fetch(`${R2_URL}/data/google-news.json`)
      .then(res => res.json())
      .then(data => setGoogleNews(data))
      .catch(() => console.warn("Google news not available"));
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

  const handleProClick = () => {
    setIsProMode(prev => !prev);
  };

  const countries = Object.keys(moodData);

  // Get localized mood label
  const getMoodLabel = (mood: string) => {
    return moodLabels[mood]?.[lang] ?? mood;
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
            <button className="green-btn" onClick={() => setLang(lang === 'ko' ? 'en' : lang === 'en' ? 'ja' : 'ko')}>
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

          {/* Google Corporate News Box */}
          {googleNews && googleNews.translations[lang] && (
            <div className="google-news-box glass">
              <div className="box-header">
                <span className="source">{googleNews.translations[lang].title}</span>
                <span className="sentiment-tag" style={{ color: '#FDC830' }}>{googleNews.sentiment}</span>
              </div>
              <ul className="news-list">
                {googleNews.translations[lang].headlines.map((hl, i) => (
                  <li key={i}>{hl}</li>
                ))}
              </ul>
              <div className="update-marker">{googleNews.translations[lang].footer}</div>
            </div>
          )}
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
          className={`action-btn pro-btn ${isProMode ? 'pro-active' : ''}`}
          onClick={handleProClick}
        >
          <ArrowUpRight size={20} />
          <span>{isProMode ? (lang === 'ko' ? '■ PRO 활성' : lang === 'ja' ? '■ PRO 有効' : '■ PRO ACTIVE') : t.proMode}</span>
        </button>
      </div>

      {/* PRO Mode badge */}
      {isProMode && (
        <div className={`pro-badge glass ${isSidebarOpen ? 'shifted' : ''}`}>
          <span>⚡ PRO</span>
          <span className="pro-badge-detail">{getNextUpdateMessage()}</span>
        </div>
      )}

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
                  { day: lang === 'ko' ? '6일전' : lang === 'ja' ? '6日前' : '6d ago', words: lang === 'ko' ? ['긴장', '금리', '무역'] : ['Conflict', 'Rates', 'Trade'], isCurrent: false },
                  { day: lang === 'ko' ? '5일전' : lang === 'ja' ? '5日前' : '5d ago', words: lang === 'ko' ? ['탐욕', '상승', '호재'] : ['Greed', 'Rise', 'Bullish'], isCurrent: false },
                  { day: lang === 'ko' ? '4일전' : lang === 'ja' ? '4日前' : '4d ago', words: lang === 'ko' ? ['혁신', 'AI', '발표'] : ['Innovation', 'AI', 'Launch'], isCurrent: false },
                  { day: lang === 'ko' ? '3일전' : lang === 'ja' ? '3日前' : '3d ago', words: lang === 'ko' ? ['패닉', '하락', '매도'] : ['Panic', 'Drop', 'Sell'], isCurrent: false },
                  { day: lang === 'ko' ? '그제' : lang === 'ja' ? '一昨日' : '2d ago', words: lang === 'ko' ? ['안정', '균형', '유지'] : ['Calm', 'Balance', 'Steady'], isCurrent: false },
                  { day: lang === 'ko' ? '어제' : lang === 'ja' ? '昨日' : '1d ago', words: lang === 'ko' ? ['안정', '회복', '지표'] : ['Calm', 'Recovery', 'Index'], isCurrent: false },
                  { day: lang === 'ko' ? '오늘' : lang === 'ja' ? '今日' : 'Today', words: [langMood.word, ...langMood.subTopics.slice(0, 2)], isCurrent: true },
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

        .google-news-box {
          margin-top: 30px;
          padding: 20px;
          border-radius: 16px;
          max-width: 350px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
        }
        .google-news-box .box-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        .google-news-box .source {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 1px;
          opacity: 0.6;
        }
        .google-news-box .sentiment-tag {
          font-size: 10px;
          font-weight: 950;
        }
        .google-news-box .news-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .google-news-box .news-list li {
          font-size: 12px;
          line-height: 1.4;
          opacity: 0.8;
          position: relative;
          padding-left: 12px;
        }
        .google-news-box .news-list li::before {
          content: '•';
          position: absolute;
          left: 0;
          color: #FDC830;
        }
        .google-news-box .update-marker {
          margin-top: 12px;
          font-size: 9px;
          opacity: 0.4;
          font-weight: 600;
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
        .pro-btn {
          background: #FDC830 !important;
          color: black !important;
          border: none;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .pro-btn:hover {
          transform: scale(1.04);
          box-shadow: 0 0 18px rgba(253,200,48,0.6);
        }
        .pro-active {
          background: linear-gradient(135deg, #FDC830, #F37335) !important;
          color: white !important;
          box-shadow: 0 0 18px rgba(253,200,48,0.6);
        }

        .pro-badge {
          position: fixed;
          top: 100px;
          right: 40px;
          padding: 8px 18px;
          border-radius: 16px;
          z-index: 100;
          display: flex;
          flex-direction: column;
          gap: 4px;
          border: 1px solid rgba(253,200,48,0.4);
          transition: right 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .pro-badge.shifted {
          right: 560px;
        }
        .pro-badge span:first-child {
          font-size: 12px;
          font-weight: 800;
          color: #FDC830;
        }
        .pro-badge-detail {
          font-size: 10px;
          opacity: 0.6;
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

        /* Sidebar: wider and cleaner layout */
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
        .light-mode .timeline-modal {
          background: rgba(255, 255, 255, 0.9);
          border: 1px solid rgba(0,0,0,0.1);
        }
      `}</style>
    </div>
  );
};

export default App;
