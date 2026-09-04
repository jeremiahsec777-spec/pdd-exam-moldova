import { Routes, Route, NavLink, Link } from 'react-router-dom';
import HomePage from './pages/HomePage';
import QuizPage from './pages/QuizPage';
import ExamPage from './pages/ExamPage';
import StatsPage from './pages/StatsPage';
import SettingsPage from './pages/SettingsPage';
import AiCoachPage from './pages/AiCoachPage';
import { AiGenPage } from './pages/AiGenPage';

function App() {
  return (
    <>
      <header className="app-header">
        <div className="app-container">
          <Link to="/" className="app-logo">
            <span className="app-logo-icon">🚗</span>
            <span>ПДД Тест</span>
          </Link>
          <nav className="nav-links">
            <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Темы
            </NavLink>
            <NavLink to="/exam" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} style={{ fontWeight: 600, color: 'var(--accent-primary-light)' }}>
              🚦 Экзамен
            </NavLink>
            <NavLink to="/ai-coach" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} style={{ fontWeight: 600 }}>
              🧠 AI Тренер
            </NavLink>
            <NavLink to="/stats" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Статистика
            </NavLink>
            <NavLink to="/ai-gen" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              AI-Генератор
            </NavLink>
            <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              ⚙️
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="app-container">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/exam" element={<ExamPage />} />
          <Route path="/ai-coach" element={<AiCoachPage />} />
          <Route path="/quiz/:topicKey" element={<QuizPage />} />
          <Route path="/practice" element={<QuizPage practice />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/ai-gen" element={<AiGenPage />} />
        </Routes>
      </main>
    </>
  );
}

export default App;
