import { useEffect, useState, type ChangeEvent } from 'react';
import type { AppSettings } from '../types';
import { loadSettings, saveSettings, clearSessionData, loadAllStats, exportCorrections, exportStatsCSV, importCorrections } from '../data/quizStore';

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>({ geminiApiKey: '' });
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [requiredCorrectAnswers, setRequiredCorrectAnswers] = useState<string>('5');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const loaded = await loadSettings();
      setSettings(loaded);
      setApiKeyInput(loaded.geminiApiKey || '');
      setRequiredCorrectAnswers(String(loaded.requiredCorrectAnswers ?? 5));
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
      requiredCorrectAnswers: parsedAnswers
    };
    await saveSettings(newSettings);
    setSettings(newSettings);
    alert('Настройки сохранены');
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
      // add BOM for excel UTF-8 compatibility
      const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
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

      <div className="section">
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
              <div className="settings-label">Backup Data</div>
              <div className="settings-desc">Export or import your offline quiz modifications</div>
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
