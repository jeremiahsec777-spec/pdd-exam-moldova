import { createContext } from 'react';
import type { User } from 'firebase/auth';
import type { SyncStatus } from '../services/syncService';

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  isConfigured: boolean;
  syncStatus: SyncStatus;
  lastSyncedAt: Date | null;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  triggerManualSync: () => Promise<void>;
  refreshConfig: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
