import { get, set } from 'idb-keyval';
import type { QuizData, TopicStats, AnswerCorrection, ImageReassignment, SessionData, AppSettings, ExamResult } from '../types';

const CURRENT_DATA_VERSION = 'v1.0.2';

const KEYS = {
  QUIZ_DATA: 'quiz_data',
  DATA_VERSION: 'quiz_data_version',
  STATS: 'stats',
  CORRECTIONS: 'corrections',
  IMAGE_REASSIGNMENTS: 'image_reassignments',
  SETTINGS: 'app_settings',
  EXAM_RESULTS: 'exam_results',
};

// ============ Quiz Data ============
export async function loadQuizData(): Promise<QuizData> {
  // Check cached version first
  const storedVersion = await get<string>(KEYS.DATA_VERSION);
  const cached = await get<QuizData>(KEYS.QUIZ_DATA);

  if (cached && storedVersion === CURRENT_DATA_VERSION) {
    return cached;
  }

  // Fetch from static file with cache-buster query parameter
  const res = await fetch(`/data/quiz_data.json?v=${CURRENT_DATA_VERSION}`);
  const data: QuizData = await res.json();
  await set(KEYS.QUIZ_DATA, data);
  await set(KEYS.DATA_VERSION, CURRENT_DATA_VERSION);
  return data;
}

// ============ Stats ============
export async function loadAllStats(): Promise<Record<string, TopicStats>> {
  return (await get<Record<string, TopicStats>>(KEYS.STATS)) || {};
}

export async function saveAllStats(stats: Record<string, TopicStats>): Promise<void> {
  await set(KEYS.STATS, stats);
}

export async function getTopicStats(topicKey: string): Promise<TopicStats> {
  const all = await loadAllStats();
  return all[topicKey] || {};
}

export async function saveQuizResults(
  topicKey: string,
  score: number,
  mistakes: string[],
  correct: string[]
): Promise<void> {
  const all = await loadAllStats();
  const ts = all[topicKey] || {};
  const settings = await loadSettings();
  const targetCount = settings.requiredCorrectAnswers ?? 5;

  if (!ts.bestScore || score > ts.bestScore) {
    ts.bestScore = Math.round(score);
  }

  const history = ts.mistakeHistory || [];
  history.unshift(mistakes);
  ts.mistakeHistory = history.slice(0, 3);

  if (!ts.mistakesRemaining) {
    ts.mistakesRemaining = {};
  }
  mistakes.forEach(q => {
    ts.mistakesRemaining![q] = targetCount;
  });

  const correctSet = new Set(ts.correctlyAnsweredQuestions || []);
  correct.forEach(q => correctSet.add(q));
  ts.correctlyAnsweredQuestions = Array.from(correctSet);

  delete ts.sessionData;
  all[topicKey] = ts;
  await saveAllStats(all);
}

export async function saveSessionData(topicKey: string, session: SessionData): Promise<void> {
  const all = await loadAllStats();
  const ts = all[topicKey] || {};
  ts.sessionData = session;
  all[topicKey] = ts;
  await saveAllStats(all);
}

export async function savePracticeResults(
  mistakes: string[],
  correct: string[]
): Promise<void> {
  const all = await loadAllStats();
  const settings = await loadSettings();
  const targetCount = settings.requiredCorrectAnswers ?? 5;

  // Find which topics these questions belong to and update them
  // We need the original quiz data to map questions back to topics
  const quizData = await loadQuizData();
  const questionToTopicMap: Record<string, string> = {};

  Object.keys(quizData.topics).forEach(topicKey => {
    quizData.topics[topicKey].questions.forEach(q => {
      questionToTopicMap[q.id] = topicKey;
      questionToTopicMap[q.question] = topicKey;
    });
  });

  // Group by topic
  const correctByTopic: Record<string, string[]> = {};
  const mistakesByTopic: Record<string, string[]> = {};

  correct.forEach(q => {
    const t = questionToTopicMap[q];
    if (t) {
      if (!correctByTopic[t]) correctByTopic[t] = [];
      correctByTopic[t].push(q);
    }
  });

  mistakes.forEach(q => {
    const t = questionToTopicMap[q];
    if (t) {
      if (!mistakesByTopic[t]) mistakesByTopic[t] = [];
      mistakesByTopic[t].push(q);
    }
  });

  // Update stats for each affected topic
  const affectedTopics = new Set([...Object.keys(correctByTopic), ...Object.keys(mistakesByTopic)]);

  affectedTopics.forEach(topicKey => {
    const ts = all[topicKey] || {};

    if (!ts.mistakesRemaining) {
      ts.mistakesRemaining = {};
    }

    // Add to correctly answered
    const correctSet = new Set(ts.correctlyAnsweredQuestions || []);
    (correctByTopic[topicKey] || []).forEach(q => correctSet.add(q));
    ts.correctlyAnsweredQuestions = Array.from(correctSet);

    // Track completed corrections
    const completelyCorrected: string[] = [];
    (correctByTopic[topicKey] || []).forEach(q => {
      if (ts.mistakesRemaining![q] === undefined) {
        // Old mistake that didn't have a count yet
        // 1 correct answer means (targetCount - 1) left, bounded to a minimum of 0
        ts.mistakesRemaining![q] = Math.max(0, targetCount - 1);
      } else {
        ts.mistakesRemaining![q] -= 1;
      }

      if (ts.mistakesRemaining![q] <= 0) {
        delete ts.mistakesRemaining![q];
        completelyCorrected.push(q);
      }
    });

    if (ts.mistakeHistory) {
      ts.mistakeHistory = ts.mistakeHistory.map(run => {
        return run.filter(q => !completelyCorrected.includes(q));
      });

      // Add new mistakes to the history and reset their remaining count to targetCount
      if (mistakesByTopic[topicKey]) {
        if (ts.mistakeHistory.length > 0) {
          // Add to latest run
          mistakesByTopic[topicKey].forEach(q => {
             if (!ts.mistakeHistory![0].includes(q)) {
                 ts.mistakeHistory![0].push(q);
             }
             ts.mistakesRemaining![q] = targetCount;
          });
        } else {
          ts.mistakeHistory.unshift(mistakesByTopic[topicKey]);
          mistakesByTopic[topicKey].forEach(q => {
             ts.mistakesRemaining![q] = targetCount;
          });
        }
      }
    }

    all[topicKey] = ts;
  });

  await saveAllStats(all);
}

export async function clearSessionData(topicKey: string): Promise<void> {
  const all = await loadAllStats();
  const ts = all[topicKey] || {};
  delete ts.sessionData;
  all[topicKey] = ts;
  await saveAllStats(all);
}

// ============ Answer Corrections ============
export async function loadCorrections(): Promise<Record<string, AnswerCorrection>> {
  return (await get<Record<string, AnswerCorrection>>(KEYS.CORRECTIONS)) || {};
}

export async function saveCorrection(questionId: string, correction: AnswerCorrection): Promise<void> {
  const all = await loadCorrections();
  all[questionId] = correction;
  await set(KEYS.CORRECTIONS, all);
}

export async function deleteCorrection(questionId: string): Promise<void> {
  const all = await loadCorrections();
  delete all[questionId];
  await set(KEYS.CORRECTIONS, all);
}

// ============ Image Reassignments ============
export async function loadImageReassignments(): Promise<Record<string, ImageReassignment>> {
  return (await get<Record<string, ImageReassignment>>(KEYS.IMAGE_REASSIGNMENTS)) || {};
}

export async function saveImageReassignment(questionId: string, reassignment: ImageReassignment): Promise<void> {
  const all = await loadImageReassignments();
  all[questionId] = reassignment;
  await set(KEYS.IMAGE_REASSIGNMENTS, all);
}

export async function deleteImageReassignment(questionId: string): Promise<void> {
  const all = await loadImageReassignments();
  delete all[questionId];
  await set(KEYS.IMAGE_REASSIGNMENTS, all);
}

// ============ User-uploaded image blobs ============
export async function saveImageBlob(key: string, blob: Blob): Promise<string> {
  const id = `img_blob_${key}_${Date.now()}`;
  await set(id, blob);
  return id;
}

export async function getImageBlob(id: string): Promise<string | null> {
  const blob = await get<Blob>(id);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

// ============ Settings ============
export async function loadSettings(): Promise<AppSettings> {
  return (await get<AppSettings>(KEYS.SETTINGS)) || { geminiApiKey: '' };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await set(KEYS.SETTINGS, settings);
}

// ============ Export / Import ============
export async function exportCorrections(): Promise<string> {
  const corrections = await loadCorrections();
  const reassignments = await loadImageReassignments();
  return JSON.stringify({ corrections, imageReassignments: reassignments }, null, 2);
}

export async function exportStatsCSV(): Promise<string> {
  const stats = await loadAllStats();
  let csv = "Topic,Best Score (%),Questions Answered Correctly,Mistake History Count\n";

  for (const topicKey of Object.keys(stats)) {
    const ts = stats[topicKey];
    const bestScore = ts.bestScore ?? 0;
    const correctCount = ts.correctlyAnsweredQuestions?.length ?? 0;
    const mistakesCount = ts.mistakeHistory?.reduce((acc, curr) => acc + curr.length, 0) ?? 0;

    // Escape quotes and commas in topic keys just in case
    const safeTopicKey = `"${topicKey.replace(/"/g, '""')}"`;
    csv += `${safeTopicKey},${bestScore},${correctCount},${mistakesCount}\n`;
  }
  return csv;
}

export async function importCorrections(jsonStr: string): Promise<void> {
  const data = JSON.parse(jsonStr);
  if (data.corrections) {
    await set(KEYS.CORRECTIONS, data.corrections);
  }
  if (data.imageReassignments) {
    await set(KEYS.IMAGE_REASSIGNMENTS, data.imageReassignments);
  }
}

// ============ Exam Simulation ============
export async function loadExamResults(): Promise<ExamResult[]> {
  return (await get<ExamResult[]>(KEYS.EXAM_RESULTS)) || [];
}

export async function saveExamResult(result: ExamResult): Promise<void> {
  const all = await loadExamResults();
  all.unshift(result);
  await set(KEYS.EXAM_RESULTS, all.slice(0, 50)); // store up to last 50 attempts
}

