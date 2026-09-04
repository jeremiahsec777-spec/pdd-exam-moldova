import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/useAuth';
import { Link } from 'react-router-dom';

export const UserSyncBadge: React.FC = () => {
  const {
    user,
    loading,
    isConfigured,
    syncStatus,
    signInWithGoogle,
    signOutUser,
    triggerManualSync,
  } = useAuth();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpen]);

  if (loading) {
    return (
      <div className="auth-badge-skeleton">
        <span className="sync-spinner-sm" />
      </div>
    );
  }

  // Not configured yet
  if (!isConfigured) {
    return (
      <Link
        to="/settings#cloud-sync"
        className="auth-btn-unconfigured"
        title="Настройте синхронизацию для сохранения прогресса на всех устройствах"
      >
        <span className="auth-cloud-icon">☁️</span>
        <span className="auth-btn-text">Синхронизация</span>
      </Link>
    );
  }

  // Configured but not logged in
  if (!user) {
    return (
      <button
        className="btn-google-login"
        onClick={signInWithGoogle}
        title="Войти через Google для синхронизации прогресса"
      >
        <svg className="google-icon" viewBox="0 0 24 24" width="16" height="16">
          <path
            fill="#4285F4"
            d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.02h3.87c2.26-2.09 3.67-5.17 3.67-9.12z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.87-3.02c-1.08.72-2.45 1.16-4.06 1.16-3.13 0-5.78-2.11-6.73-4.96H1.28v3.12C3.26 21.36 7.36 24 12 24z"
          />
          <path
            fill="#FBBC05"
            d="M5.27 14.27c-.24-.72-.38-1.49-.38-2.27s.14-1.55.38-2.27V6.61H1.28C.46 8.23 0 10.06 0 12s.46 3.77 1.28 5.39l3.99-3.12z"
          />
          <path
            fill="#EA4335"
            d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.36 0 3.26 2.64 1.28 6.61l3.99 3.12c.95-2.85 3.6-4.98 6.73-4.98z"
          />
        </svg>
        <span className="auth-btn-text">Войти</span>
      </button>
    );
  }

  // Logged in
  const initials = (user.displayName || user.email || 'U')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  const getSyncIcon = () => {
    switch (syncStatus) {
      case 'syncing':
        return <span className="sync-indicator-icon syncing" title="Синхронизация...">🔄</span>;
      case 'synced':
        return <span className="sync-indicator-icon synced" title="Синхронизировано">🟢</span>;
      case 'error':
        return <span className="sync-indicator-icon error" title="Ошибка синхронизации">⚠️</span>;
      default:
        return <span className="sync-indicator-icon idle" title="Готово">☁️</span>;
    }
  };

  return (
    <div className="auth-user-wrapper" ref={menuRef}>
      <button
        className="auth-user-pill"
        onClick={() => setMenuOpen(!menuOpen)}
        aria-label="Профиль пользователя"
      >
        <div className="auth-avatar-container">
          {user.photoURL ? (
            <img src={user.photoURL} alt={user.displayName || 'User'} className="auth-avatar-img" />
          ) : (
            <div className="auth-avatar-initials">{initials}</div>
          )}
          <span className={`sync-status-dot ${syncStatus}`} />
        </div>
        <span className="auth-user-name">{user.displayName?.split(' ')[0] || 'Профиль'}</span>
      </button>

      {menuOpen && (
        <div className="auth-dropdown-menu">
          <div className="auth-dropdown-header">
            <div className="auth-dropdown-name">{user.displayName || 'Пользователь'}</div>
            <div className="auth-dropdown-email">{user.email}</div>
            <div className="auth-dropdown-status">
              {getSyncIcon()}
              <span>
                {syncStatus === 'syncing'
                  ? 'Синхронизация...'
                  : syncStatus === 'synced'
                  ? 'Синхронизировано с облаком'
                  : syncStatus === 'error'
                  ? 'Ошибка синхронизации'
                  : 'Синхронизировано'}
              </span>
            </div>
          </div>

          <div className="auth-dropdown-divider" />

          <button
            className="auth-dropdown-item"
            onClick={() => {
              triggerManualSync();
              setMenuOpen(false);
            }}
          >
            <span className="item-icon">🔄</span>
            <span>Синхронизировать сейчас</span>
          </button>

          <Link
            to="/settings"
            className="auth-dropdown-item"
            onClick={() => setMenuOpen(false)}
          >
            <span className="item-icon">⚙️</span>
            <span>Настройки аккаунта</span>
          </Link>

          <div className="auth-dropdown-divider" />

          <button
            className="auth-dropdown-item text-danger"
            onClick={() => {
              signOutUser();
              setMenuOpen(false);
            }}
          >
            <span className="item-icon">🚪</span>
            <span>Выйти</span>
          </button>
        </div>
      )}
    </div>
  );
};
