import React, { useEffect, useState, useCallback, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { getFirebaseServices, resetFirebase } from '../services/firebase';
import {
  syncUserData,
  scheduleCloudPush,
  subscribeToCloudSync,
  type SyncStatus,
} from '../services/syncService';
import { AuthContext } from './auth-context';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isConfigured, setIsConfigured] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const initAuth = useCallback(() => {
    const { auth, isConfigured: configured } = getFirebaseServices();
    setIsConfigured(configured);

    if (!configured || !auth) {
      setUser(null);
      setLoading(false);
      setSyncStatus('idle');
      return () => {};
    }

    const unsubscribeAuth = onAuthStateChanged(
      auth,
      async (firebaseUser) => {
        setUser(firebaseUser);
        setLoading(false);
        setError(null);

        if (firebaseUser) {
          setSyncStatus('syncing');
          try {
            await syncUserData(firebaseUser);
            setSyncStatus('synced');
            setLastSyncedAt(new Date());
          } catch (e: unknown) {
            console.error('Initial sync error:', e);
            setSyncStatus('error');
            setError(e instanceof Error ? e.message : 'Ошибка синхронизации');
          }
        } else {
          setSyncStatus('idle');
        }
      },
      (authErr) => {
        console.error('Auth state error:', authErr);
        setError(authErr.message);
        setLoading(false);
      }
    );

    return unsubscribeAuth;
  }, []);

  useEffect(() => {
    const cleanupAuth = initAuth();
    return () => {
      cleanupAuth();
    };
  }, [initAuth]);

  // Handle active user syncing and local changes
  useEffect(() => {
    if (!user) return;

    // Listen to changes from other devices in real-time
    const unsubscribeCloud = subscribeToCloudSync(user, () => {
      setSyncStatus('synced');
      setLastSyncedAt(new Date());
    });

    // Listen to local changes and schedule push
    const handleDataChanged = () => {
      setSyncStatus('syncing');
      scheduleCloudPush(user);
    };

    const handleSyncStatus = (event: Event) => {
      const customEvent = event as CustomEvent<{ status: SyncStatus }>;
      if (customEvent.detail?.status) {
        setSyncStatus(customEvent.detail.status);
        if (customEvent.detail.status === 'synced') {
          setLastSyncedAt(new Date());
        }
      }
    };

    window.addEventListener('pdd_data_changed', handleDataChanged);
    window.addEventListener('pdd_sync_status', handleSyncStatus);

    return () => {
      unsubscribeCloud();
      window.removeEventListener('pdd_data_changed', handleDataChanged);
      window.removeEventListener('pdd_sync_status', handleSyncStatus);
    };
  }, [user]);

  const signInWithGoogle = async () => {
    setError(null);
    const { auth, googleProvider, isConfigured: configured } = getFirebaseServices();

    if (!configured || !auth || !googleProvider) {
      const msg = 'Firebase не настроен. Пожалуйста, укажите параметры Firebase в Настройках.';
      setError(msg);
      alert(msg);
      return;
    }

    try {
      setLoading(true);
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      const authErr = err as { code?: string; message?: string };
      console.error('Google Sign In error:', authErr);

      if (authErr.code === 'auth/unauthorized-domain') {
        const domain = window.location.hostname;
        const msg = `Домен "${domain}" не авторизован в Firebase Console.\nДобавьте его в Firebase Console -> Authentication -> Settings -> Authorized Domains.`;
        setError(msg);
        alert(msg);
      } else if (authErr.code === 'auth/popup-closed-by-user' || authErr.code === 'auth/cancelled-popup-request') {
        // User voluntarily closed the window
      } else {
        const msg = authErr.message || 'Ошибка авторизации Google';
        setError(msg);
        alert(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const signOutUser = async () => {
    const { auth } = getFirebaseServices();
    if (!auth) return;

    try {
      await signOut(auth);
      setUser(null);
      setSyncStatus('idle');
      setError(null);
    } catch (err: unknown) {
      console.error('Sign Out error:', err);
    }
  };

  const triggerManualSync = async () => {
    if (!user) return;
    setSyncStatus('syncing');
    setError(null);
    try {
      await syncUserData(user);
      setSyncStatus('synced');
      setLastSyncedAt(new Date());
    } catch (err: unknown) {
      setSyncStatus('error');
      setError(err instanceof Error ? err.message : 'Ошибка при ручной синхронизации');
    }
  };

  const refreshConfig = async () => {
    await resetFirebase();
    initAuth();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isConfigured,
        syncStatus,
        lastSyncedAt,
        error,
        signInWithGoogle,
        signOutUser,
        triggerManualSync,
        refreshConfig,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

