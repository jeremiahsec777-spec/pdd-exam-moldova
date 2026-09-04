import { doc, getDoc, setDoc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { getFirebaseServices } from './firebase';
import {
  loadAllStats,
  saveAllStats,
  loadExamResults,
  saveAllExamResults,
  loadSettings,
  saveSettings,
} from '../data/quizStore';
import type { TopicStats, ExamResult, AppSettings } from '../types';

export interface CloudUserData {
  updatedAt: number;
  stats: Record<string, TopicStats>;
  examResults: ExamResult[];
  settings: AppSettings;
}

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

let lastPushedTimestamp = 0;
let isInternalUpdate = false;

/**
 * Smart merge topic statistics from local IndexedDB and remote Firestore
 */
export function mergeStats(
  local: Record<string, TopicStats>,
  remote: Record<string, TopicStats>
): Record<string, TopicStats> {
  const merged: Record<string, TopicStats> = { ...local };

  for (const topicKey of Object.keys(remote)) {
    const rTopic = remote[topicKey];
    const lTopic = merged[topicKey];

    if (!lTopic) {
      merged[topicKey] = rTopic;
      continue;
    }

    // Merge best score (highest achieved)
    const bestScore = Math.max(lTopic.bestScore ?? 0, rTopic.bestScore ?? 0);

    // Merge correctly answered questions (union)
    const correctlySet = new Set([
      ...(lTopic.correctlyAnsweredQuestions || []),
      ...(rTopic.correctlyAnsweredQuestions || []),
    ]);

    // Merge mistakesRemaining: take minimum remaining (more progress)
    const mistakesRemaining: Record<string, number> = {};
    const allMistakeKeys = new Set([
      ...Object.keys(lTopic.mistakesRemaining || {}),
      ...Object.keys(rTopic.mistakesRemaining || {}),
    ]);

    for (const q of allMistakeKeys) {
      const lVal = lTopic.mistakesRemaining?.[q];
      const rVal = rTopic.mistakesRemaining?.[q];

      if (lVal !== undefined && rVal !== undefined) {
        mistakesRemaining[q] = Math.min(lVal, rVal);
      } else if (lVal !== undefined) {
        mistakesRemaining[q] = lVal;
      } else if (rVal !== undefined) {
        mistakesRemaining[q] = rVal;
      }
    }

    // Merge mistakeHistory: take unique runs up to 5
    const combinedHistory = [
      ...(lTopic.mistakeHistory || []),
      ...(rTopic.mistakeHistory || []),
    ];
    const seenRuns = new Set<string>();
    const filteredHistory: string[][] = [];
    for (const run of combinedHistory) {
      const serialized = JSON.stringify([...run].sort());
      if (!seenRuns.has(serialized)) {
        seenRuns.add(serialized);
        filteredHistory.push(run);
      }
    }

    merged[topicKey] = {
      bestScore: bestScore > 0 ? bestScore : undefined,
      correctlyAnsweredQuestions: Array.from(correctlySet),
      mistakesRemaining,
      mistakeHistory: filteredHistory.slice(0, 5),
      sessionData: lTopic.sessionData || rTopic.sessionData,
    };
  }

  return merged;
}

/**
 * Merge exam history deduplicated by ID and sorted by date
 */
export function mergeExamResults(local: ExamResult[], remote: ExamResult[]): ExamResult[] {
  const map = new Map<string, ExamResult>();

  for (const item of [...remote, ...local]) {
    const key = item.id || `${item.timestamp}_${item.correctCount}_${item.totalQuestions}`;
    if (!map.has(key)) {
      map.set(key, item);
    }
  }

  const merged = Array.from(map.values());
  merged.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  return merged.slice(0, 50);
}

/**
 * Merge user settings
 */
export function mergeSettings(local: AppSettings, remote: AppSettings): AppSettings {
  return {
    geminiApiKey: local.geminiApiKey || remote.geminiApiKey || '',
    requiredCorrectAnswers: remote.requiredCorrectAnswers || local.requiredCorrectAnswers || 5,
  };
}

/**
 * Perform a full two-way sync between local storage and Firestore
 */
export async function syncUserData(user: User): Promise<void> {
  const { db } = getFirebaseServices();
  if (!db || !user) return;

  const userDocRef = doc(db, 'users', user.uid);
  const localStats = await loadAllStats();
  const localExams = await loadExamResults();
  const localSettings = await loadSettings();

  try {
    const snap = await getDoc(userDocRef);

    if (!snap.exists()) {
      // First-time cloud backup for this user
      const now = Date.now();
      lastPushedTimestamp = now;
      const initialCloudData: CloudUserData = {
        updatedAt: now,
        stats: localStats,
        examResults: localExams,
        settings: localSettings,
      };
      await setDoc(userDocRef, initialCloudData);
    } else {
      const remoteData = snap.data() as CloudUserData;

      // Smart two-way merge
      const mergedStats = mergeStats(localStats, remoteData.stats || {});
      const mergedExams = mergeExamResults(localExams, remoteData.examResults || []);
      const mergedSettingsObj = mergeSettings(localSettings, remoteData.settings || { geminiApiKey: '' });

      // Save to local IndexedDB without triggering recursive push
      isInternalUpdate = true;
      try {
        await saveAllStats(mergedStats);
        await saveAllExamResults(mergedExams);
        await saveSettings(mergedSettingsObj);
      } finally {
        isInternalUpdate = false;
      }

      // Push merged state back to cloud
      const now = Date.now();
      lastPushedTimestamp = now;
      const updatedCloudData: CloudUserData = {
        updatedAt: now,
        stats: mergedStats,
        examResults: mergedExams,
        settings: mergedSettingsObj,
      };
      await setDoc(userDocRef, updatedCloudData);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pdd_data_synced'));
    }
  } catch (err) {
    console.error('Failed to sync user data with Firestore:', err);
    throw err;
  }
}

/**
 * Push current local state to cloud (debounced)
 */
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleCloudPush(user: User | null, delayMs = 800): void {
  if (!user || isInternalUpdate) return;

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(async () => {
    debounceTimer = null;
    const { db } = getFirebaseServices();
    if (!db || !user) return;

    try {
      const userDocRef = doc(db, 'users', user.uid);
      const localStats = await loadAllStats();
      const localExams = await loadExamResults();
      const localSettings = await loadSettings();

      const now = Date.now();
      lastPushedTimestamp = now;

      const cloudData: CloudUserData = {
        updatedAt: now,
        stats: localStats,
        examResults: localExams,
        settings: localSettings,
      };

      await setDoc(userDocRef, cloudData, { merge: true });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pdd_sync_status', { detail: { status: 'synced' } }));
      }
    } catch (error) {
      console.warn('Failed background cloud push:', error);
    }
  }, delayMs);
}

/**
 * Listen to real-time changes on Firestore document from other devices
 */
export function subscribeToCloudSync(user: User, onSyncComplete?: () => void): Unsubscribe {
  const { db } = getFirebaseServices();
  if (!db || !user) return () => {};

  const userDocRef = doc(db, 'users', user.uid);

  return onSnapshot(
    userDocRef,
    async (snap) => {
      if (!snap.exists()) return;

      const remoteData = snap.data() as CloudUserData;

      // Avoid self-echo if this snapshot was triggered by our own write
      if (remoteData.updatedAt && remoteData.updatedAt <= lastPushedTimestamp) {
        return;
      }

      const localStats = await loadAllStats();
      const localExams = await loadExamResults();
      const localSettings = await loadSettings();

      const mergedStats = mergeStats(localStats, remoteData.stats || {});
      const mergedExams = mergeExamResults(localExams, remoteData.examResults || []);
      const mergedSettingsObj = mergeSettings(localSettings, remoteData.settings || { geminiApiKey: '' });

      isInternalUpdate = true;
      try {
        await saveAllStats(mergedStats);
        await saveAllExamResults(mergedExams);
        await saveSettings(mergedSettingsObj);
        lastPushedTimestamp = remoteData.updatedAt || Date.now();
      } finally {
        isInternalUpdate = false;
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pdd_data_synced'));
      }
      if (onSyncComplete) {
        onSyncComplete();
      }
    },
    (error) => {
      console.warn('Firestore subscription error:', error);
    }
  );
}
