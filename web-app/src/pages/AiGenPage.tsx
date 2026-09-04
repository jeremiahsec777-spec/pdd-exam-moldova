import { useState, type ChangeEvent } from 'react';
import { GoogleGenAI } from '@google/genai';
import { useNavigate } from 'react-router-dom';
import { loadSettings, loadQuizData } from '../data/quizStore';
import { set } from 'idb-keyval';
import type { QuizData } from '../types';

interface GeneratedQuestion {
  text: string;
  options: string[];
  correctIndex: number;
}

export const AiGenPage = () => {
  const [image, setImage] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GeneratedQuestion | null>(null);
  const [error, setError] = useState<string>('');

  const navigate = useNavigate();

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setImage(e.target.files[0]);
    }
  };

  const fileToGenerativePart = async (file: File): Promise<{ inlineData: { data: string; mimeType: string } }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result as string;
        const base64 = base64data.split(',')[1];
        resolve({
          inlineData: { data: base64, mimeType: file.type }
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const generateQuestion = async () => {
    if (!image) {
      setError('Пожалуйста, загрузите изображение дорожного знака или ситуации.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const settings = await loadSettings();
      if (!settings.geminiApiKey) {
        throw new Error('Не настроен Gemini API ключ. Пожалуйста, укажите его в Настройках (⚙️).');
      }

      const ai = new GoogleGenAI({ apiKey: settings.geminiApiKey });
      const imagePart = await fileToGenerativePart(image);

      const prompt = `Проанализируй этот дорожный знак или дорожную ситуацию.
Создай тестовый вопрос по ПДД с 3 или 4 вариантами ответов в строгом формате JSON без markdown:
{
  "text": "Вопрос...",
  "options": ["Вариант 1", "Вариант 2", "Вариант 3"],
  "correctIndex": 0
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }, imagePart] }]
      });

      const text = response.text || '';
      try {
        const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanJson) as GeneratedQuestion;
        setResult(parsed);
      } catch {
        setError('Не удалось распознать ответ модели как JSON. Ответ: ' + text);
      }
    } catch (e: unknown) {
      if (e instanceof Error) {
        setError(e.message);
      } else {
        setError('Ошибка при генерации вопроса.');
      }
    } finally {
      setLoading(false);
    }
  };

  const saveToDatabase = async () => {
    if (!result) return;
    try {
      const quizData: QuizData = await loadQuizData();
      const customTopicKey = 'Пользовательские вопросы (AI)';

      if (!quizData.topics[customTopicKey]) {
        quizData.topics[customTopicKey] = {
          questions: [],
          count: 0
        };
        quizData.topicCount += 1;
      }

      const newQ = {
        id: `ai_${Date.now()}`,
        question: result.text,
        options: result.options,
        correct_index: result.correctIndex,
        explanation: 'Вопрос сгенерирован ИИ по загруженному знаку.',
        image: null
      };

      quizData.topics[customTopicKey].questions.push(newQ);
      quizData.topics[customTopicKey].count += 1;
      quizData.totalQuestions += 1;

      await set('quiz_data', quizData);
      alert('Вопрос успешно сохранен в тему "Пользовательские вопросы (AI)"!');
      navigate('/');
    } catch {
      alert('Ошибка при сохранении вопроса.');
    }
  };

  return (
    <div className="page">
      <div className="hero">
        <h1 className="hero-title">🤖 AI Генератор вопросов</h1>
        <p className="hero-subtitle">
          Загрузите фотографию знака или перекрёстка — ИИ составит экзаменационный вопрос
        </p>
      </div>

      <div className="section">
        <div className="card">
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontWeight: 600, display: 'block', marginBottom: '8px' }}>
              Фотография знака или ситуации:
            </label>
            <input type="file" accept="image/*" onChange={handleImageUpload} className="input" />
            {image && (
              <div style={{ marginTop: '12px' }}>
                <img
                  src={URL.createObjectURL(image)}
                  alt="Предпросмотр"
                  style={{ maxHeight: '200px', borderRadius: 'var(--radius-md)', objectFit: 'contain' }}
                />
              </div>
            )}
          </div>

          <button
            onClick={generateQuestion}
            disabled={loading || !image}
            className="btn btn-primary"
            style={{ width: '100%' }}
          >
            {loading ? '⏳ Анализируем изображение...' : '✨ Сгенерировать вопрос'}
          </button>

          {error && (
            <div style={{ marginTop: '16px', color: 'var(--error)', background: 'var(--error-bg)', padding: '12px', borderRadius: 'var(--radius-sm)' }}>
              {error}
            </div>
          )}

          {result && (
            <div className="card" style={{ marginTop: '24px', border: '1px solid var(--border)' }}>
              <h3 style={{ marginBottom: '12px' }}>Сгенерированный вопрос:</h3>
              <p style={{ fontSize: '1.1rem', marginBottom: '16px' }}><strong>{result.text}</strong></p>

              <div className="option-list" style={{ marginBottom: '16px' }}>
                {result.options.map((opt: string, i: number) => (
                  <div
                    key={i}
                    className={`option-item ${i === result.correctIndex ? 'option-correct' : ''}`}
                  >
                    <div className="option-radio"></div>
                    {opt} {i === result.correctIndex && ' ✓ (Правильный)'}
                  </div>
                ))}
              </div>

              <button
                onClick={saveToDatabase}
                className="btn btn-primary"
              >
                💾 Сохранить вопрос в базу
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
