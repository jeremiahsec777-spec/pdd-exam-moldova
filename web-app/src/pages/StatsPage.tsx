import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { QuizData, TopicStats, ExamResult } from '../types';
import { loadQuizData, loadAllStats, loadExamResults } from '../data/quizStore';

export default function StatsPage() {
  const [quizData, setQuizData] = useState<QuizData | null>(null);
  const [stats, setStats] = useState<Record<string, TopicStats>>({});
  const [examResults, setExamResults] = useState<ExamResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [data, allStats, exams] = await Promise.all([
          loadQuizData(),
          loadAllStats(),
          loadExamResults()
        ]);
        setQuizData(data);
        setStats(allStats);
        setExamResults(exams);
      } catch (e) {
        console.error('Failed to load stats data', e);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="page" style={{ textAlign: 'center' }}>Loading stats...</div>;
  if (!quizData) return <div className="page" style={{ textAlign: 'center' }}>No data found.</div>;

  let totalQuestions = 0;
  let totalAnswered = 0;
  let totalCorrect = 0;
  let totalWrong = 0;

  const allCorrect = new Set<string>();
  const allMistakes = new Set<string>();

  Object.values(stats).forEach(ts => {
    (ts.correctlyAnsweredQuestions || []).forEach(q => allCorrect.add(q));
    (ts.mistakeHistory || []).forEach(run => run.forEach(q => allMistakes.add(q)));
  });

  const allAnswered = new Set([...allCorrect, ...allMistakes]);

  totalQuestions = quizData.totalQuestions;
  totalAnswered = allAnswered.size;
  totalCorrect = allCorrect.size;
  totalWrong = allMistakes.size;

  const coverage = totalQuestions > 0 ? Math.round((totalAnswered / totalQuestions) * 100) : 0;

  const passedExams = examResults.filter(e => e.passed).length;
  const examPassRate = examResults.length > 0 ? Math.round((passedExams / examResults.length) * 100) : 0;

  return (
    <div className="page">
      {/* AI Coach Banner */}
      <div className="card" style={{
        marginBottom: '24px',
        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.15))',
        border: '1px solid rgba(139, 92, 246, 0.3)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <h3 style={{ margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🧠</span> Персональный AI-анализ знаний от Gemini 3.8 Flash
          </h3>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Gemini 3.8 Flash выявит закономерности ваших ошибок, объяснит фундаментальные принципы ПДД и сформирует план обучения.
          </p>
        </div>
        <Link to="/ai-coach" className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}>
          Запустить AI Тренера →
        </Link>
      </div>

      {/* Overall stats */}
      <div className="section">
        <h2 className="section-title">📊 Общая Статистика</h2>
        <div className="card">
          <p style={{ fontSize: '1.1rem', marginBottom: '10px' }}>Ваш Общий Прогресс</p>
          <ul style={{ listStyleType: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <li><strong>Охват материала:</strong> {coverage}%</li>
            <li><strong>Всего вопросов в базе:</strong> {totalQuestions}</li>
            <li><strong>Пройдено уникальных:</strong> {totalAnswered}</li>
            <li style={{ color: 'var(--success)' }}><strong>Уникальных правильных:</strong> {totalCorrect}</li>
            <li style={{ color: 'var(--error)' }}><strong>Уникальных с ошибками:</strong> {totalWrong}</li>
          </ul>
        </div>
      </div>

      {/* Exam Simulation Stats */}
      <div className="section">
        <h2 className="section-title">🚦 Статистика Экзаменов</h2>
        <div className="stats-grid" style={{ marginBottom: '16px' }}>
          <div className="card stats-card">
            <div className="stats-value">{examResults.length}</div>
            <div className="stats-label">Попыток сдачи</div>
          </div>
          <div className="card stats-card">
            <div className="stats-value" style={{ color: 'var(--success)' }}>{passedExams}</div>
            <div className="stats-label">Сдано успешно</div>
          </div>
          <div className="card stats-card">
            <div className="stats-value">{examPassRate}%</div>
            <div className="stats-label">Процент сдачи</div>
          </div>
        </div>

        {examResults.length > 0 && (
          <div className="card">
            <h4 style={{ marginBottom: '12px' }}>Последние попытки:</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {examResults.slice(0, 5).map(res => {
                const dateStr = new Date(res.timestamp).toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit'
                });
                return (
                  <div
                    key={res.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      background: 'var(--bg-secondary)',
                      borderRadius: 'var(--radius-sm)'
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600, color: res.passed ? 'var(--success)' : 'var(--error)' }}>
                        {res.passed ? '✓ Сдан' : '✗ Не сдан'}
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginLeft: '10px' }}>
                        {dateStr}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.9rem' }}>
                      {res.correctCount}/{res.totalQuestions} ({res.mistakesCount} ош.) • {Math.floor(res.timeSpentSeconds / 60)}м {res.timeSpentSeconds % 60}с
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* By topic */}
      <div className="section">
        <h2 className="section-title">📚 По темам</h2>
        <div className="topic-grid">
          {Object.keys(quizData.topics).sort().map(key => {
            const ts = stats[key] || {};
            if (!ts.bestScore && !ts.mistakeHistory?.length && !ts.correctlyAnsweredQuestions?.length) return null;

            return (
              <div key={key} className="card topic-card">
                <div className="topic-card-left">
                  <span className="topic-name">{key}</span>
                  <span className="topic-meta">
                    {ts.bestScore !== undefined ? `Лучший: ${ts.bestScore}%` : 'Ещё не завершено'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
