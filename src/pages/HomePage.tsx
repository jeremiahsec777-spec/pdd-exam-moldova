import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { QuizData, TopicStats } from '../types';
import { loadQuizData, loadAllStats } from '../data/quizStore';

export default function HomePage() {
  const [quizData, setQuizData] = useState<QuizData | null>(null);
  const [stats, setStats] = useState<Record<string, TopicStats>>({});
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    function fetchState() {
      Promise.all([loadQuizData(), loadAllStats()])
        .then(([data, allStats]) => {
          if (active) {
            setQuizData(data);
            setStats(allStats);
            setLoading(false);
          }
        })
        .catch((e) => {
          console.error('Failed to load data', e);
          if (active) setLoading(false);
        });
    }

    fetchState();
    window.addEventListener('pdd_data_synced', fetchState);
    return () => {
      active = false;
      window.removeEventListener('pdd_data_synced', fetchState);
    };
  }, []);

  const hasMistakes = () => {
    for (const ts of Object.values(stats)) {
      const history = ts.mistakeHistory || [];
      if (history.some(run => run.length > 0)) return true;
    }
    return false;
  };

  const overallStats = () => {
    if (!quizData) return { total: 0, answered: 0, correct: 0, coverage: 0 };
    const allCorrect = new Set<string>();
    const allMistakes = new Set<string>();
    for (const ts of Object.values(stats)) {
      (ts.correctlyAnsweredQuestions || []).forEach(q => allCorrect.add(q));
      (ts.mistakeHistory || []).forEach(run => run.forEach(q => allMistakes.add(q)));
    }
    const allAnswered = new Set([...allCorrect, ...allMistakes]);
    const total = quizData.totalQuestions;
    return {
      total,
      answered: allAnswered.size,
      correct: allCorrect.size,
      coverage: total > 0 ? Math.round((allAnswered.size / total) * 100) : 0,
    };
  };

  if (loading) {
    return (
      <div className="page" style={{ textAlign: 'center', padding: '80px 0' }}>
        <div style={{ fontSize: '2rem', marginBottom: 16 }}>⏳</div>
        <p style={{ color: 'var(--text-muted)' }}>Загрузка данных...</p>
      </div>
    );
  }

  if (!quizData) {
    return (
      <div className="page" style={{ textAlign: 'center', padding: '80px 0' }}>
        <div style={{ fontSize: '2rem', marginBottom: 16 }}>❌</div>
        <p>Не удалось загрузить данные. Проверьте подключение.</p>
      </div>
    );
  }

  const os = overallStats();
  const topicKeys = Object.keys(quizData.topics).sort();

  return (
    <div className="page">
      <div className="hero">
        <h1 className="hero-title">ПДД Молдова</h1>
        <p className="hero-subtitle">
          Тренажёр для подготовки к экзамену по Правилам Дорожного Движения
        </p>
      </div>

      {/* Overall stats */}
      <div className="section">
        <div className="stats-grid">
          <div className="card stats-card">
            <div className="stats-value">{os.coverage}%</div>
            <div className="stats-label">Охват</div>
          </div>
          <div className="card stats-card">
            <div className="stats-value">{os.total}</div>
            <div className="stats-label">Вопросов</div>
          </div>
          <div className="card stats-card">
            <div className="stats-value">{os.answered}</div>
            <div className="stats-label">Пройдено</div>
          </div>
          <div className="card stats-card">
            <div className="stats-value">{os.correct}</div>
            <div className="stats-label">Правильных</div>
          </div>
        </div>
      </div>

      {/* Exam Simulation banner */}
      <div className="section">
        <div className="exam-launch-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '4px' }}>🚦 Симулятор Экзамена</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                20 случайных вопросов • 20 минут • Максимум 2 ошибки
              </p>
            </div>
            <button
              className="btn btn-primary btn-lg"
              onClick={() => navigate('/exam')}
              style={{ background: 'var(--accent-gradient)', border: 'none', fontWeight: 700 }}
            >
              Начать экзамен
            </button>
          </div>
        </div>
      </div>

      {/* Practice mode & AI Coach */}
      <div className="section" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <button
          className="btn btn-primary btn-lg"
          style={{ width: '100%' }}
          disabled={!hasMistakes()}
          onClick={() => navigate('/practice')}
        >
          🔁 Проработать ошибки
        </button>
        <button
          className="btn btn-outline btn-lg"
          style={{ width: '100%', borderColor: 'var(--accent-primary)', color: 'var(--accent-primary-light)', fontWeight: 600 }}
          onClick={() => navigate('/ai-coach')}
        >
          🧠 AI Тренер: диагностика знаний и принципов
        </button>
        {!hasMistakes() && (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 2, fontSize: '0.85rem' }}>
            Пройдите хотя бы один тест или экзамен, чтобы AI собрал статистику по вашим ответам
          </p>
        )}
      </div>

      {/* Topic list */}
      <div className="section">
        <h2 className="section-title">📚 Темы</h2>
        <div className="topic-grid">
          {topicKeys.map(key => {
            const topic = quizData.topics[key];
            const ts = stats[key] || {};
            const hasSession = !!ts.sessionData;

            return (
              <div
                key={key}
                className="card card-clickable topic-card"
                onClick={() => navigate(`/quiz/${encodeURIComponent(key)}`)}
              >
                <div className="topic-card-left">
                  <span className="topic-name">{key}</span>
                  <span className="topic-meta">
                    {topic.count} вопросов
                    {ts.bestScore != null && (
                      <span className="stat-chip stat-chip-success">
                        🏆 {ts.bestScore}%
                      </span>
                    )}
                  </span>
                </div>
                <div className="topic-card-right">
                  {hasSession && <span className="badge badge-continue">▶ Продолжить</span>}
                  <span style={{ color: 'var(--text-muted)', fontSize: '1.2rem' }}>→</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
