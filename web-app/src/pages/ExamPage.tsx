import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { QuizData, Question, ExamResult } from '../types';
import { loadQuizData, saveExamResult } from '../data/quizStore';
import { analyzeExamMistakes } from '../services/aiCoach';
import MarkdownView from '../components/MarkdownView';

const EXAM_QUESTION_COUNT = 20;
const EXAM_DURATION_SECONDS = 20 * 60; // 20 minutes
const MAX_ALLOWED_MISTAKES = 2;

export default function ExamPage() {
  const navigate = useNavigate();

  const [quizData, setQuizData] = useState<QuizData | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({});
  const [isFinished, setIsFinished] = useState(false);
  const [timeLeft, setTimeLeft] = useState(EXAM_DURATION_SECONDS);
  const [loading, setLoading] = useState(true);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [examResult, setExamResult] = useState<ExamResult | null>(null);
  const [aiAnalysisText, setAiAnalysisText] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const timerRef = useRef<number | null>(null);
  const finishExamRef = useRef<(timeExpired?: boolean) => Promise<void>>(() => Promise.resolve());

  // Initialize exam with Fisher-Yates uniform shuffle
  const startNewExam = (data: QuizData) => {
    const allQ: Question[] = [];
    Object.values(data.topics).forEach(topic => {
      topic.questions.forEach(q => allQ.push(q));
    });

    if (allQ.length === 0) return;

    const shuffled = [...allQ];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const selected = shuffled.slice(0, Math.min(EXAM_QUESTION_COUNT, shuffled.length));

    setQuestions(selected);
    setCurrentIdx(0);
    setUserAnswers({});
    setIsFinished(false);
    setTimeLeft(EXAM_DURATION_SECONDS);
    setImageErrors({});
    setExamResult(null);
    setAiAnalysisText(null);
    setAiError(null);
  };

  useEffect(() => {
    (async () => {
      try {
        const data = await loadQuizData();
        setQuizData(data);
        startNewExam(data);
      } catch (err) {
        console.error('Failed to load exam data', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const finishExam = async (timeExpired = false) => {
    if (isFinished) return;
    if (timerRef.current) clearInterval(timerRef.current);

    setIsFinished(true);

    let correctCount = 0;
    const mistakes: string[] = [];

    questions.forEach((q, idx) => {
      const userAns = userAnswers[idx];
      if (userAns === q.correct_index) {
        correctCount++;
      } else {
        mistakes.push(q.id);
      }
    });

    const mistakesCount = questions.length - correctCount;
    const passed = !timeExpired && mistakesCount <= MAX_ALLOWED_MISTAKES;
    const timeSpent = EXAM_DURATION_SECONDS - timeLeft;

    const result: ExamResult = {
      id: `exam_${Date.now()}`,
      timestamp: Date.now(),
      totalQuestions: questions.length,
      correctCount,
      mistakesCount,
      passed,
      timeSpentSeconds: timeSpent,
      mistakeQuestionIds: mistakes,
    };

    setExamResult(result);
    await saveExamResult(result);
  };

  const handleAnalyzeMistakesWithAi = async () => {
    if (!examResult || examResult.mistakesCount === 0) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const analysis = await analyzeExamMistakes(questions, userAnswers);
      setAiAnalysisText(analysis);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Неизвестная ошибка при запросе к AI';
      setAiError(msg);
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    finishExamRef.current = finishExam;
  });

  // Timer effect
  useEffect(() => {
    if (loading || isFinished || questions.length === 0) return;

    timerRef.current = window.setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          finishExamRef.current(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loading, isFinished, questions.length]);

  const handleSelectOption = (optionIdx: number) => {
    if (isFinished) return;
    setUserAnswers(prev => ({ ...prev, [currentIdx]: optionIdx }));
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="page" style={{ textAlign: 'center', padding: '80px 0' }}>
        <div style={{ fontSize: '2rem', marginBottom: 16 }}>⏳</div>
        <p style={{ color: 'var(--text-muted)' }}>Подготовка экзаменационного билета...</p>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="page" style={{ textAlign: 'center', padding: '80px 0' }}>
        <p>Не удалось сформировать экзаменационный билет.</p>
        <button className="btn btn-primary" onClick={() => navigate('/')}>На главную</button>
      </div>
    );
  }

  const answeredCount = Object.keys(userAnswers).length;
  const currentQ = questions[currentIdx];
  const displayImageUrl = currentQ?.image ? `/images/${currentQ.image}` : null;

  // Results Screen
  if (isFinished && examResult) {
    return (
      <div className="page">
        <div className={`exam-banner ${examResult.passed ? 'exam-banner-passed' : 'exam-banner-failed'}`}>
          <div style={{ fontSize: '3rem', marginBottom: '8px' }}>
            {examResult.passed ? '🎉' : '❌'}
          </div>
          <h2>{examResult.passed ? 'ЭКЗАМЕН СДАН!' : 'ЭКЗАМЕН НЕ СДАН'}</h2>
          <p style={{ fontSize: '1.1rem', marginTop: '8px' }}>
            {examResult.passed
              ? `Поздравляем! Вы допустили ${examResult.mistakesCount} ${examResult.mistakesCount === 1 ? 'ошибку' : 'ошибок'} (допустимо до ${MAX_ALLOWED_MISTAKES}).`
              : `Допущено ошибок: ${examResult.mistakesCount} из ${questions.length} (допустимо максимум ${MAX_ALLOWED_MISTAKES}).`}
          </p>
        </div>

        <div className="card" style={{ marginBottom: '24px' }}>
          <h3 style={{ marginBottom: '16px' }}>Итоги экзамена</h3>
          <div className="stats-grid" style={{ marginBottom: '20px' }}>
            <div className="card stats-card">
              <div className="stats-value">{examResult.correctCount} / {examResult.totalQuestions}</div>
              <div className="stats-label">Правильных ответов</div>
            </div>
            <div className="card stats-card">
              <div className="stats-value" style={{ color: examResult.mistakesCount <= MAX_ALLOWED_MISTAKES ? 'var(--success)' : 'var(--error)' }}>
                {examResult.mistakesCount}
              </div>
              <div className="stats-label">Ошибок</div>
            </div>
            <div className="card stats-card">
              <div className="stats-value">{formatTimer(examResult.timeSpentSeconds)}</div>
              <div className="stats-label">Затрачено времени</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => quizData && startNewExam(quizData)}>
              🔄 Пройти новый экзамен
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/')}>
              На главную
            </button>
            {examResult.mistakesCount > 0 && (
              <button
                className="btn btn-outline"
                style={{ borderColor: 'var(--primary)', color: 'var(--primary)', fontWeight: 600 }}
                onClick={handleAnalyzeMistakesWithAi}
                disabled={aiLoading}
              >
                {aiLoading ? '⏳ Gemini 3.8 Flash анализирует ошибки...' : '🤖 Разобрать ошибки с Gemini 3.8 Flash'}
              </button>
            )}
          </div>
        </div>

        {aiError && (
          <div className="card" style={{ marginBottom: '24px', borderLeft: '4px solid var(--error)', background: '#fff5f5' }}>
            <h4 style={{ color: 'var(--error)', marginBottom: '8px' }}>Ошибка AI-анализа</h4>
            <p style={{ fontSize: '0.9rem', marginBottom: '8px' }}>{aiError}</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Проверьте ваш API-ключ Gemini на странице <span style={{ color: 'var(--primary)', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => navigate('/ai-coach')}>🧠 AI Тренер</span>.
            </p>
          </div>
        )}

        {aiAnalysisText && (
          <div className="card" style={{ marginBottom: '24px', borderLeft: '4px solid var(--primary)', background: '#f8faff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <span style={{ fontSize: '1.4rem' }}>🤖</span>
              <h3 style={{ margin: 0, color: 'var(--primary)' }}>Разбор ошибок от Gemini 3.8 Flash</h3>
            </div>
            <MarkdownView content={aiAnalysisText} />
          </div>
        )}

        {/* Review Mistakes */}
        {examResult.mistakesCount > 0 && (
          <div className="section">
            <h3 style={{ marginBottom: '16px' }}>Разбор допущенных ошибок ({examResult.mistakesCount}):</h3>
            {questions.map((q, idx) => {
              const userAns = userAnswers[idx];
              if (userAns === q.correct_index) return null;

              const imgUrl = q.image ? `/images/${q.image}` : null;

              return (
                <div key={q.id} className="card" style={{ marginBottom: '16px', borderLeft: '4px solid var(--error)' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-secondary)' }}>
                    Вопрос {idx + 1}
                  </div>
                  <p style={{ fontSize: '1.05rem', marginBottom: '12px' }}>{q.question}</p>

                  {imgUrl && !imageErrors[q.id] && (
                    <div className="question-image-wrapper" style={{ marginBottom: '12px' }}>
                      <img
                        src={imgUrl}
                        alt="Question"
                        className="question-image"
                        onClick={() => setLightboxUrl(imgUrl)}
                        onError={() => setImageErrors(prev => ({ ...prev, [q.id]: true }))}
                      />
                    </div>
                  )}

                  <div className="option-list" style={{ marginBottom: '12px' }}>
                    {q.options.map((opt, oIdx) => {
                      let itemClass = 'option-item';
                      if (oIdx === q.correct_index) itemClass += ' option-correct';
                      else if (oIdx === userAns) itemClass += ' option-wrong';
                      itemClass += ' option-disabled';

                      return (
                        <div key={oIdx} className={itemClass}>
                          <div className="option-radio"></div>
                          {opt} {oIdx === q.correct_index && '✓ (Правильно)'} {oIdx === userAns && oIdx !== q.correct_index && '✗ (Ваш ответ)'}
                        </div>
                      );
                    })}
                  </div>

                  {q.explanation && (
                    <div className="explanation-box" style={{ marginTop: '10px' }}>
                      <strong>Объяснение:</strong> {q.explanation}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {lightboxUrl && (
          <div className="lightbox-overlay" onClick={() => setLightboxUrl(null)}>
            <button className="lightbox-close" onClick={() => setLightboxUrl(null)}>✕</button>
            <img src={lightboxUrl} alt="Enlarged" className="lightbox-img" onClick={e => e.stopPropagation()} />
          </div>
        )}
      </div>
    );
  }

  // Active Exam View
  const timerClass = timeLeft <= 120 ? 'exam-timer-danger' : timeLeft <= 300 ? 'exam-timer-warning' : '';

  return (
    <div className="page">
      <div className="exam-header">
        <div>
          <h2 style={{ fontSize: '1.4rem' }}>Экзамен ПДД</h2>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Отвечено: {answeredCount} из {questions.length} | Лимит ошибок: {MAX_ALLOWED_MISTAKES}
          </div>
        </div>
        <div className={`exam-timer ${timerClass}`}>
          ⏱️ {formatTimer(timeLeft)}
        </div>
      </div>

      {/* Progress / Navigation dots */}
      <div className="exam-dots">
        {questions.map((_, idx) => {
          let dotClass = 'exam-dot';
          if (idx === currentIdx) dotClass += ' exam-dot-current';
          else if (userAnswers[idx] !== undefined) dotClass += ' exam-dot-answered';

          return (
            <div
              key={idx}
              className={dotClass}
              onClick={() => setCurrentIdx(idx)}
            >
              {idx + 1}
            </div>
          );
        })}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
          <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
            Вопрос {currentIdx + 1} из {questions.length}
          </span>
          <span style={{ color: userAnswers[currentIdx] !== undefined ? 'var(--success)' : 'var(--warning)', fontSize: '0.85rem' }}>
            {userAnswers[currentIdx] !== undefined ? '✓ Выбран ответ' : 'Ожидает ответа'}
          </span>
        </div>

        {displayImageUrl && !imageErrors[currentQ.id] && (
          <div className="question-image-wrapper">
            <img
              src={displayImageUrl}
              alt="Question"
              className="question-image"
              onClick={() => setLightboxUrl(displayImageUrl)}
              onError={() => setImageErrors(prev => ({ ...prev, [currentQ.id]: true }))}
            />
            <div className="image-zoom-hint">🔍 Увеличить</div>
          </div>
        )}

        {displayImageUrl && imageErrors[currentQ.id] && (
          <div className="image-fallback-card">
            <div className="image-fallback-badge">⚠️ Изображение недоступно</div>
            <p style={{ margin: '6px 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Файл изображения не найден: {currentQ.image}
            </p>
          </div>
        )}

        <p style={{ fontSize: '1.15rem', marginBottom: '20px', lineHeight: 1.5 }}>
          {currentQ.question}
        </p>

        <div className="option-list">
          {currentQ.options.map((opt, idx) => {
            const isSelected = userAnswers[currentIdx] === idx;
            return (
              <div
                key={idx}
                className={`option-item ${isSelected ? 'option-selected' : ''}`}
                onClick={() => handleSelectOption(idx)}
              >
                <div className="option-radio"></div>
                {opt}
              </div>
            );
          })}
        </div>

        <div className="quiz-bottom-bar" style={{ marginTop: '24px' }}>
          <div className="quiz-nav-buttons">
            <button
              className="btn btn-secondary"
              onClick={() => setCurrentIdx(prev => Math.max(0, prev - 1))}
              disabled={currentIdx === 0}
            >
              &lt; Назад
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setCurrentIdx(prev => Math.min(questions.length - 1, prev + 1))}
              disabled={currentIdx === questions.length - 1}
            >
              Вперёд &gt;
            </button>
          </div>

          <button
            className="btn btn-primary"
            onClick={() => finishExam(false)}
          >
            {answeredCount === questions.length ? 'Завершить экзамен' : 'Сдать досрочно'}
          </button>
        </div>
      </div>

      {lightboxUrl && (
        <div className="lightbox-overlay" onClick={() => setLightboxUrl(null)}>
          <button className="lightbox-close" onClick={() => setLightboxUrl(null)}>✕</button>
          <img src={lightboxUrl} alt="Enlarged" className="lightbox-img" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
