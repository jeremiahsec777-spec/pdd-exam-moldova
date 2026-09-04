import { GoogleGenAI } from '@google/genai';
import { loadQuizData, loadAllStats, loadExamResults, loadSettings } from '../data/quizStore';
import type { Question } from '../types';

export interface AiCoachAnalysis {
  timestamp: number;
  weakTopics: string[];
  strongTopics: string[];
  summary: string;
  misconceptions: string;
  principlesExplanation: string;
  strengths: string;
  recommendations: string;
}

export async function runFullAiAnalysis(): Promise<AiCoachAnalysis> {
  const settings = await loadSettings();
  if (!settings.geminiApiKey) {
    throw new Error('API ключ Gemini не настроен. Пожалуйста, укажите его в настройках или в поле ниже.');
  }

  const [quizData, stats, examResults] = await Promise.all([
    loadQuizData(),
    loadAllStats(),
    loadExamResults()
  ]);

  // 1. Identify Strong and Weak Topics
  const topicPerformance: Array<{
    name: string;
    bestScore: number;
    mistakeCount: number;
    correctCount: number;
  }> = [];

  for (const topicKey of Object.keys(quizData.topics)) {
    const ts = stats[topicKey] || {};
    const bestScore = ts.bestScore ?? 0;
    const mistakeCount = ts.mistakeHistory?.reduce((acc, curr) => acc + curr.length, 0) ?? 0;
    const correctCount = ts.correctlyAnsweredQuestions?.length ?? 0;

    if (bestScore > 0 || mistakeCount > 0 || correctCount > 0) {
      topicPerformance.push({
        name: topicKey,
        bestScore,
        mistakeCount,
        correctCount
      });
    }
  }

  // Sort topics by score ascending (weakest first)
  topicPerformance.sort((a, b) => a.bestScore - b.bestScore);
  const weakTopics = topicPerformance.filter(t => t.bestScore < 85 || t.mistakeCount > 2).map(t => t.name).slice(0, 5);
  const strongTopics = topicPerformance.filter(t => t.bestScore >= 90 && t.mistakeCount <= 1).map(t => t.name).slice(0, 5);

  // 2. Collect sample of specific questions user got wrong
  const mistakeQuestionMap = new Map<string, Question>();
  
  // From topic mistake histories
  Object.values(stats).forEach(ts => {
    (ts.mistakeHistory || []).forEach(run => {
      run.forEach(item => {
        // item can be question ID or question text
        Object.values(quizData.topics).forEach(topic => {
          topic.questions.forEach(q => {
            if (q.id === item || q.question === item) {
              mistakeQuestionMap.set(q.id, q);
            }
          });
        });
      });
    });
  });

  // From exam results
  examResults.slice(0, 5).forEach(exam => {
    exam.mistakeQuestionIds.forEach(qId => {
      Object.values(quizData.topics).forEach(topic => {
        const found = topic.questions.find(q => q.id === qId);
        if (found) mistakeQuestionMap.set(found.id, found);
      });
    });
  });

  const sampleMistakes = Array.from(mistakeQuestionMap.values()).slice(0, 15);

  if (topicPerformance.length === 0 && sampleMistakes.length === 0) {
    throw new Error('Недостаточно данных для анализа. Пройдите хотя бы один тест по теме или симулятор экзамена, чтобы ИИ мог оценить ваши знания.');
  }

  const mistakeSummaries = sampleMistakes.map((q, i) => 
    `${i + 1}. Вопрос: "${q.question}"\n   Правильный ответ: "${q.options[q.correct_index]}"\n   Пояснение ПДД: "${q.explanation}"`
  ).join('\n\n');

  const prompt = `Ты — профессиональный, дружелюбный и проницательный инструктор по Правилам Дорожного Движения (ПДД Республики Молдова / СНГ).
Твоя цель — проанализировать результаты ученика, выявить НЕ просто названия тем, а глубинную логику и ПРИНЦИПЫ, в которых он путается, и просто объяснить их на пальцах.

ДАННЫЕ УЧЕНИКА:
- Слабые темы: ${weakTopics.length > 0 ? weakTopics.join(', ') : 'Не выражены ярко'}
- Сильные темы: ${strongTopics.length > 0 ? strongTopics.join(', ') : 'Пока мало данных'}
- Всего попыток сдачи симулятора экзамена: ${examResults.length} (Успешно: ${examResults.filter(e => e.passed).length})

ПРИМЕРЫ ВОПРОСОВ, В КОТОРЫХ УЧЕНИК ДОПУСКАЛ ОШИБКИ:
${mistakeSummaries || 'Конкретные вопросы пока не накоплены, ориентируйся на темы.'}

СФОРМУЛИРУЙ АНАЛИЗ В 4 ЧЕТКИХ РАЗДЕЛАХ (используй форматирование markdown):

### 1. 🔍 Выявленные пробелы и типичные заблуждения
Определи 2-3 фундаментальных дорожных принципа или шаблона, в которых ученик путается (например: приоритет помехи справа против знаков приоритета, отличие остановки от стоянки, сигналы регулировщика рука/грудь, проезд круговых перекрестков).

### 2. 💡 Разбор принципов на пальцах
Объясни каждый из выявленных принципов простым человеческим языком, с запоминающимися ассоциациями, правилами-шпаргалками или мнемониками, чтобы в следующий раз ученик не сомневался.

### 3. 💪 Ваши сильные стороны
Похвали ученика за темы и навыки, которые уже освоены хорошо.

### 4. 🎯 Персональный план подготовки
Конкретные 3 шага: какие 2-3 темы перепройти, на что обратить внимание при сдаче экзамена.`;

  const ai = new GoogleGenAI({ apiKey: settings.geminiApiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }]
  });

  const fullText = response.text || '';

  // Extract sections or return full text
  return {
    timestamp: Date.now(),
    weakTopics,
    strongTopics,
    summary: fullText,
    misconceptions: extractSection(fullText, '1. 🔍 Выявленные пробелы и типичные заблуждения', '### 2.'),
    principlesExplanation: extractSection(fullText, '2. 💡 Разбор принципов на пальцах', '### 3.'),
    strengths: extractSection(fullText, '3. 💪 Ваши сильные стороны', '### 4.'),
    recommendations: extractSection(fullText, '4. 🎯 Персональный план подготовки', null),
  };
}

export async function analyzeExamMistakes(examQuestions: Question[], userAnswers: Record<number, number>): Promise<string> {
  const settings = await loadSettings();
  if (!settings.geminiApiKey) {
    throw new Error('API ключ Gemini не настроен. Укажите его в Настройках (⚙️).');
  }

  const mistakes: Array<{ q: Question; userAns: string; correctAns: string }> = [];
  examQuestions.forEach((q, idx) => {
    const uIdx = userAnswers[idx];
    if (uIdx !== q.correct_index) {
      mistakes.push({
        q,
        userAns: q.options[uIdx] || 'Не отвечено',
        correctAns: q.options[q.correct_index]
      });
    }
  });

  if (mistakes.length === 0) {
    return 'У вас нет ошибок в этом экзамене! Превосходный результат!';
  }

  const list = mistakes.map((m, i) => 
    `${i + 1}. Вопрос: "${m.q.question}"\n   Ваш выбор: "${m.userAns}"\n   Правильный ответ: "${m.correctAns}"\n   Пункт ПДД: "${m.q.explanation}"`
  ).join('\n\n');

  const prompt = `Ты — добрый и опытный преподаватель автошколы.
Ученик только что сдал симулятор экзамена и допустил следующие ошибки:

${list}

Сделай краткий, ободряющий и предельно понятный разбор:
1. В чём главная логическая ошибка в этих вопросах (какой принцип не был учтен)?
2. Как просто запомнить правильное правило (краткая подсказка / правило "на всю жизнь")?
Пиши живо, понятно и кратко (до 250 слов).`;

  const ai = new GoogleGenAI({ apiKey: settings.geminiApiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }]
  });

  return response.text || '';
}

function extractSection(text: string, startHeader: string, nextHeader: string | null): string {
  const startIdx = text.indexOf(startHeader);
  if (startIdx === -1) return '';
  const contentStart = startIdx + startHeader.length;
  if (!nextHeader) {
    return text.substring(contentStart).trim();
  }
  const endIdx = text.indexOf(nextHeader, contentStart);
  if (endIdx === -1) return text.substring(contentStart).trim();
  return text.substring(contentStart, endIdx).trim();
}
