import { useEffect, useState, type ChangeEvent } from 'react';
import type { AppSettings } from '../types';
import {
  loadSettings,
  saveSettings,
  clearSessionData,
  loadAllStats,
  exportCorrections,
  exportStatsCSV,
  importCorrections,
} from '../data/quizStore';
import { useAuth } from '../context/useAuth';
import {
  getStoredFirebaseConfig,
  saveStoredFirebaseConfig,
  type FirebaseConfig,
} from '../services/firebase';

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>({ geminiApiKey: '' });
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [requiredCorrectAnswers, setRequiredCorrectAnswers] = useState<string>('5');
  const [loading, setLoading] = useState(true);

  // Firebase Config State
  const [fbApiKey, setFbApiKey] = useState('');
  const [fbProjectId, setFbProjectId] = useState('');
  const [fbAuthDomain, setFbAuthDomain] = useState('');
  const [showFbSetup, setShowFbSetup] = useState(false);

  const {
    user,
    isConfigured,
    syncStatus,
    lastSyncedAt,
    error: authError,
    signInWithGoogle,
    signOutUser,
    triggerManualSync,
    refreshConfig,
  } = useAuth();

  useEffect(() => {
    (async () => {
      const loaded = await loadSettings();
      setSettings(loaded);
      setApiKeyInput(loaded.geminiApiKey || '');
      setRequiredCorrectAnswers(String(loaded.requiredCorrectAnswers ?? 5));

      const fb = getStoredFirebaseConfig();
      if (fb) {
        setFbApiKey(fb.apiKey || '');
        setFbProjectId(fb.projectId || '');
        setFbAuthDomain(fb.authDomain || '');
      } else {
        setShowFbSetup(true);
      }

      setLoading(false);
    })();
  }, []);

  const handleSaveSettings = async () => {
    let parsedAnswers = parseInt(requiredCorrectAnswers, 10);
    if (isNaN(parsedAnswers) || parsedAnswers < 1) {
      parsedAnswers = 5;
      setRequiredCorrectAnswers('5');
    }

    const newSettings = {
      ...settings,
      geminiApiKey: apiKeyInput,
      requiredCorrectAnswers: parsedAnswers,
    };
    await saveSettings(newSettings);
    setSettings(newSettings);
    alert('Настройки сохранены');
  };

  const handleSaveFirebaseConfig = async () => {
    if (!fbApiKey.trim() || !fbProjectId.trim()) {
      alert('Пожалуйста, укажите как минимум API Key и Project ID.');
      return;
    }

    const config: FirebaseConfig = {
      apiKey: fbApiKey.trim(),
      projectId: fbProjectId.trim(),
      authDomain: fbAuthDomain.trim() || `${fbProjectId.trim()}.firebaseapp.com`,
    };

    saveStoredFirebaseConfig(config);
    await refreshConfig();
    alert('Конфигурация Firebase успешно сохранена и активирована!');
  };

  const handleResetFirebaseConfig = async () => {
    if (confirm('Удалить сохраненную конфигурацию Firebase?')) {
      saveStoredFirebaseConfig(null);
      setFbApiKey('');
      setFbProjectId('');
      setFbAuthDomain('');
      await refreshConfig();
      alert('Конфигурация сброшена.');
    }
  };

  const handleClearSessions = async () => {
    if (confirm('Вы уверены, что хотите сбросить все незавершенные сессии?')) {
      const stats = await loadAllStats();
      for (const key of Object.keys(stats)) {
        if (stats[key].sessionData) {
          await clearSessionData(key);
        }
      }
      alert('Все незавершенные сессии сброшены.');
    }
  };

  const handleExport = async () => {
    try {
      const data = await exportCorrections();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'pdd_data_backup.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Failed to export data');
    }
  };

  const handleExportCSV = async () => {
    try {
      const csvContent = await exportStatsCSV();
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'pdd_statistics.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Failed to export CSV');
    }
  };

  const handleImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const jsonStr = event.target?.result as string;
        await importCorrections(jsonStr);
        alert('Data imported successfully. Please reload the app.');
      } catch {
        alert('Failed to import data: Invalid file format.');
      }
    };
    reader.readAsText(file);
  };

  if (loading) return <div className="page" style={{ textAlign: 'center' }}>Loading settings...</div>;

  return (
    <div className="page">
      <div className="hero">
        <h1 className="hero-title">⚙️ Настройки</h1>
      </div>

      <div className="section" id="cloud-sync">
        {/* ================= CLOUD SYNC & GOOGLE AUTH CARD ================= */}
        <div className="card" style={{ marginBottom: '24px', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>☁️</span> Кроссплатформенная синхронизация (Google)
              </h2>
              <div className="settings-desc" style={{ marginTop: '4px' }}>
                Синхронизируйте результаты тестов, экзаменов и список ошибок между телефоном, планшетом и компьютером.
              </div>
            </div>
            {isConfigured && user && (
              <span className={`sync-pill-badge ${syncStatus}`}>
                {syncStatus === 'syncing' ? '🔄 Синхронизация...' : syncStatus === 'synced' ? '🟢 Синхронизировано' : '⚠️ Ошибка'}
              </span>
            )}
          </div>

          {authError && (
            <div className="auth-error-alert" style={{ marginBottom: '16px', padding: '12px', borderRadius: '8px', background: 'var(--error-bg)', color: 'var(--error)', border: '1px solid rgba(239,68,68,0.3)', fontSize: '0.9rem' }}>
              ⚠️ {authError}
            </div>
          )}

          {isConfigured ? (
            user ? (
              <div className="user-profile-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || 'User'}
                      style={{ width: '56px', height: '56px', borderRadius: '50%', border: '2px solid var(--accent-primary)' }}
                    />
                  ) : (
                    <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', fontWeight: 'bold' }}>
                      {(user.displayName || user.email || 'U')[0].toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{user.displayName || 'Пользователь Google'}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{user.email}</div>
                    {lastSyncedAt && (
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '2px' }}>
                        Последняя синхронизация: {lastSyncedAt.toLocaleTimeString()}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
                  <button className="btn btn-primary btn-sm" onClick={triggerManualSync} disabled={syncStatus === 'syncing'}>
                    🔄 Синхронизировать сейчас
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={signOutUser}>
                    🚪 Выйти из Google
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(30, 41, 59, 0.4)', border: '1px solid var(--border)' }}>
                <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
                  Вы не авторизованы. Войдите через Google, чтобы ваши ошибки, баллы за экзамены и история тестов автоматически появлялись на всех ваших устройствах.
                </p>
                <button
                  className="btn btn-primary"
                  onClick={signInWithGoogle}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', fontWeight: 600 }}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18">
                    <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.02h3.87c2.26-2.09 3.67-5.17 3.67-9.12z" />
                    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.87-3.02c-1.08.72-2.45 1.16-4.06 1.16-3.13 0-5.78-2.11-6.73-4.96H1.28v3.12C3.26 21.36 7.36 24 12 24z" />
                    <path fill="#FBBC05" d="M5.27 14.27c-.24-.72-.38-1.49-.38-2.27s.14-1.55.38-2.27V6.61H1.28C.46 8.23 0 10.06 0 12s.46 3.77 1.28 5.39l3.99-3.12z" />
                    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.36 0 3.26 2.64 1.28 6.61l3.99 3.12c.95-2.85 3.6-4.98 6.73-4.98z" />
                  </svg>
                  Войти через Google
                </button>
              </div>
            )
          ) : (
            <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-primary-light)', fontWeight: 600, marginBottom: '8px' }}>
                ℹ️ Подключение Firebase
              </div>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                Для включения Google-синхронизации введите параметры вашего бесплатного проекта Firebase ниже или настройте переменные окружения в Vercel (<code style={{ color: 'var(--accent-primary-light)' }}>VITE_FIREBASE_API_KEY</code>, <code style={{ color: 'var(--accent-primary-light)' }}>VITE_FIREBASE_PROJECT_ID</code>).
              </p>
            </div>
          )}

          {/* Firebase Configuration Accordion */}
          <div style={{ marginTop: '20px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowFbSetup(!showFbSetup)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <span>{showFbSetup ? '▼' : '▶'}</span>
              <span>Параметры подключения Firebase {isConfigured ? '(Настроено ✓)' : '(Требуется настройка)'}</span>
            </button>

            {showFbSetup && (
              <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Firebase API Key (обязательно):
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="AIzaSy..."
                    value={fbApiKey}
                    onChange={(e) => setFbApiKey(e.target.value)}
                  />
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Firebase Project ID (обязательно):
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="pdd-exam-moldova"
                    value={fbProjectId}
                    onChange={(e) => setFbProjectId(e.target.value)}
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Auth Domain (необязательно):
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="your-project.firebaseapp.com"
                    value={fbAuthDomain}
                    onChange={(e) => setFbAuthDomain(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="btn btn-primary btn-sm" onClick={handleSaveFirebaseConfig}>
                    Сохранить и подключить
                  </button>
                  {isConfigured && (
                    <button className="btn btn-secondary btn-sm" onClick={handleResetFirebaseConfig}>
                      Сбросить
                    </button>
                  )}
                </div>

                <div style={{ marginTop: '14px', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                  💡 <b>Как настроить бесплатный Firebase за 2 минуты:</b>
                  <ol style={{ paddingLeft: '18px', marginTop: '6px' }}>
                    <li>Откройте <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-primary-light)' }}>Firebase Console</a> и нажмите «Создать проект».</li>
                    <li>В меню выберите <b>Authentication</b> → вкладка <b>Sign-in method</b> → включите <b>Google</b>.</li>
                    <li>Выберите <b>Firestore Database</b> → нажмите <b>Создать базу данных</b> (режим Test).</li>
                    <li>В настройках проекта (⚙️) создайте Веб-приложение (<b>&lt;/&gt;</b>) и скопируйте сюда <code>apiKey</code> и <code>projectId</code>.</li>
                    <li>В <b>Authentication</b> → <b>Settings</b> → <b>Authorized domains</b> добавьте домен вашего сайта (например, <code>localhost</code> или ваш адрес на Vercel).</li>
                  </ol>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ================= GENERAL APP SETTINGS ================= */}
        <div className="card">
          <div className="settings-row">
            <div>
              <div className="settings-label">Сброс сессий</div>
              <div className="settings-desc">Удалить все сохраненные сессии для незавершенных тестов</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={handleClearSessions}>Сбросить</button>
          </div>
          <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
            <div style={{ width: '100%' }}>
              <div className="settings-label">Количество правильных ответов для отработки ошибки</div>
              <div className="settings-desc">Сколько раз нужно ответить правильно на вопрос из списка ошибок, чтобы он исчез оттуда</div>
            </div>
            <div style={{ display: 'flex', gap: '8px', width: '100%', marginTop: '12px' }}>
              <input
                type="number"
                min="1"
                max="10"
                className="input"
                value={requiredCorrectAnswers}
                onChange={(e) => setRequiredCorrectAnswers(e.target.value)}
              />
              <button className="btn btn-primary" onClick={handleSaveSettings}>Сохранить</button>
            </div>
          </div>
          <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
            <div style={{ width: '100%' }}>
              <div className="settings-label">API Key для Gemini AI (Gemini 3.8 Flash)</div>
              <div className="settings-desc">Для персонального анализа ошибок и разбора принципов ПДД с помощью Gemini 3.8 Flash</div>
            </div>
            <div style={{ display: 'flex', gap: '8px', width: '100%', marginTop: '12px' }}>
              <input
                type="password"
                className="input"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="Ваш Gemini API Key"
              />
              <button className="btn btn-primary" onClick={handleSaveSettings}>Сохранить</button>
            </div>
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-label">Резервная копия (Backup Data)</div>
              <div className="settings-desc">Экспорт или импорт локальных изменений и исправлений</div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-secondary btn-sm" onClick={handleExport}>Export JSON</button>
              <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', margin: 0 }}>
                Import JSON
                <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
              </label>
            </div>
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-label">Экспорт статистики</div>
              <div className="settings-desc">Скачать статистику в формате CSV для Excel</div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={handleExportCSV}>Скачать CSV</button>
          </div>
        </div>
      </div>
    </div>
  );
}
