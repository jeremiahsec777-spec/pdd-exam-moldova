export interface Question {
  id: string;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
  image: string | null;
}

export interface Topic {
  questions: Question[];
  count: number;
}

export interface QuizData {
  topics: Record<string, Topic>;
  totalQuestions: number;
  topicCount: number;
}

export interface TopicStats {
  bestScore?: number;
  mistakeHistory?: string[][];
  mistakesRemaining?: Record<string, number>;
  correctlyAnsweredQuestions?: string[];
  sessionData?: SessionData;
}

export interface SessionData {
  userAnswers: Record<number, number>;
  currentQuestionIndex: number;
  practiceQuestionIds?: string[];
}

export interface AnswerCorrection {
  newCorrectIndex?: number;
  customQuestionText?: string;
  customOptions?: string[];
  note?: string;
  timestamp: number;
}

export interface ImageReassignment {
  newImage?: string | null; // null = remove image, string = new image path/blob URL
  timestamp: number;
  questionId?: string;
  imageBlobId?: string;
}

export interface AppSettings {
  geminiApiKey: string;
  requiredCorrectAnswers?: number;
}

export interface ExamResult {
  id: string;
  timestamp: number;
  totalQuestions: number;
  correctCount: number;
  mistakesCount: number;
  passed: boolean;
  timeSpentSeconds: number;
  mistakeQuestionIds: string[];
}
