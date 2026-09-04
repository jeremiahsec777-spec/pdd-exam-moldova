import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { runFullAiAnalysis, type AiCoachAnalysis } from '../services/aiCoach';
import { loadSettings, saveSettings, loadAllStats, loadExamResults } from '../data/quizStore';
import MarkdownView from '../components/MarkdownView';

export default function AiCoachPage() {
  const navigate = useNavigate();

  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AiCoachAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [statsSummary, setStatsSummary] = useState<{
    testedTopics: number;
    totalExams: number;
  }>({ testedTopics: 0, totalExams: 0 });

  useEffect(() => {
    (async () => {
      const [settings, allStats, exams] = await Promise.all([
        loadSettings(),
        loadAllStats(),
        loadExamResults()
      ]);

      const keyPresent = !!settings.geminiApiKey && settings.geminiApiKey.trim().length > 0;
      setHasApiKey(keyPresent);
      if (keyPresent) {
        setApiKeyInput(settings.geminiApiKey);
      }

      const tested = Object.values(allStats).filter(
        ts => (ts.bestScore ?? 0) > 0 || (ts.mistakeHistory?.length ?? 0) > 0
      ).length;

      setStatsSummary({
        testedTopics: tested,
        totalExams: exams.length
      });
    })();
  }, []);

  const handleSaveKey = async () => {
    if (!apiKeyInput.trim()) {
      alert('Пожалуйста, введите API ключ.');
      return;
    }
    const current = await loadSettings();
    await saveSettings({ ...current, geminiApiKey: apiKeyInput.trim() });
    setHasApiKey(true);
    setShowKeyInput(false);
    setError(null);
    alert('API ключ успешно сохранен!');
  };

  const handleRunAnalysis = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await runFullAiAnalysis();
      setAnalysis(result);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Произошла непредвиденная ошибка при анализе.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="hero">
        <h1 className="hero-title">🧠 AI Персональный Тренер</h1>
        <p className="hero-subtitle">
          Искусственный интеллект Gemini 3.8 Flash проанализирует ваши ошибки и объяснит глубинные принципы ПДД
        </p>
      </div>

      {/* API Key Configuration Banner if not configured */}
      {(!hasApiKey || showKeyInput) && (
        <div className="card" style={{ marginBottom: '24px', border: '1px solid var(--accent-primary)' }}>
          <h3 style={{ fontSize: '1.15rem', marginBottom: '8px' }}>
            🔑 Настройка Gemini API Ключа
          </h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: 1.5 }}>
            Для работы интеллектуального тренера требуется бесплатный ключ Gemini. Вы можете получить его бесплатно в один клик на{' '}
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--accent-primary-light)', textDecoration: 'underline' }}
            >
              Google AI Studio (aistudio.google.com)
            </a>.
          </p>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input
              type="password"
              className="input"
              style={{ flex: '1 1 250px', margin: 0 }}
              placeholder="Вставьте ваш Gemini API Key (AIzaSy...)"
              value={apiKeyInput}
              onChange={e => setApiKeyInput(e.target.value)}
            />
            <button className="btn btn-primary" onClick={handleSaveKey}>
              Сохранить ключ
            </button>
            {hasApiKey && (
              <button className="btn btn-secondary" onClick={() => setShowKeyInput(false)}>
                Отмена
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Analysis Trigger Card */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '6px' }}>Диагностика знаний ПДД</h3>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              База для анализа: {statsSummary.testedTopics} пройденных тем • {statsSummary.totalExams} попыток экзамена
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {hasApiKey && !showKeyInput && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowKeyInput(true)}
                title="Сменить API ключ"
              >
                ⚙️ Ключ настроен
              </button>
            )}

            <button
              className="btn btn-primary btn-lg"
              onClick={handleRunAnalysis}
              disabled={loading}
              style={{ background: 'var(--accent-gradient)', border: 'none', fontWeight: 700 }}
            >
              {loading ? '⏳ Анализируем правила...' : '✨ Запустить AI-анализ'}
            </button>
          </div>
        </div>

        {error && (
          <div style={{ marginTop: '16px', background: 'var(--error-bg)', color: 'var(--error)', padding: '12px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--error)' }}>
            {error}
          </div>
        )}
      </div>

      {/* Loading state indicator */}
      {loading && (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px', marginBottom: '24px' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '16px', animation: 'pulse 1.5s infinite' }}>🧠</div>
          <h3 style={{ marginBottom: '8px' }}>Изучаем структуру ваших ошибок...</h3>
          <p style={{ color: 'var(--text-muted)', maxWidth: '500px', margin: '0 auto', fontSize: '0.95rem' }}>
            Gemini сопоставляет ваши ответы с правилами приоритета, знаками и сложными перекрёстками, чтобы сформулировать простые объяснения.
          </p>
        </div>
      )}

      {/* Analysis Results Display */}
      {analysis && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Section 1: Misconceptions */}
          <div className="card" style={{ borderLeft: '5px solid var(--warning)' }}>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '12px', color: 'var(--warning)' }}>
              🔍 Выявленные пробелы и типичные заблуждения
            </h3>
            <MarkdownView content={analysis.misconceptions || analysis.summary} />
          </div>

          {/* Section 2: Principles Explained */}
          {analysis.principlesExplanation && (
            <div className="card" style={{ borderLeft: '5px solid var(--accent-primary)', background: 'rgba(59, 130, 246, 0.06)' }}>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '12px', color: 'var(--accent-primary-light)' }}>
                💡 Разбор принципов на пальцах (Правила-шпаргалки)
              </h3>
              <MarkdownView content={analysis.principlesExplanation} />
            </div>
          )}

          {/* Section 3: Strengths */}
          {analysis.strengths && (
            <div className="card" style={{ borderLeft: '5px solid var(--success)' }}>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '12px', color: 'var(--success)' }}>
                💪 Ваши сильные стороны
              </h3>
              <MarkdownView content={analysis.strengths} />
            </div>
          )}

          {/* Section 4: Recommendations & Action Plan */}
          {analysis.recommendations && (
            <div className="card" style={{ borderLeft: '5px solid #a855f7' }}>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '12px', color: '#c084fc' }}>
                🎯 Персональный план подготовки
              </h3>
              <div style={{ marginBottom: '16px' }}>
                <MarkdownView content={analysis.recommendations} />
              </div>

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
                <button className="btn btn-primary" onClick={() => navigate('/practice')}>
                  🔁 Проработать ошибки
                </button>
                <button className="btn btn-secondary" onClick={() => navigate('/exam')}>
                  🚦 Сдать контрольный экзамен
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Default Prompt when no analysis run yet */}
      {!analysis && !loading && (
        <div className="card" style={{ background: 'var(--bg-secondary)', border: '1px dashed var(--border)', textAlign: 'center', padding: '36px 20px' }}>
          <div style={{ fontSize: '2rem', marginBottom: '12px' }}>💡</div>
          <h3 style={{ marginBottom: '8px' }}>Как работает AI-тренер?</h3>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '580px', margin: '0 auto', fontSize: '0.95rem', lineHeight: 1.5 }}>
            Обычные тесты просто показывают галочки «правильно/неправильно». AI-тренер на базе Gemini находит закономерности в ваших неверных ответах, выявляет, какое именно фундаментальное правило вы не поняли (например, помеху справа или разницу между полосой и проезжей частью), и даёт простое человеческое объяснение.
          </p>
        </div>
      )}
    </div>
  );
}
