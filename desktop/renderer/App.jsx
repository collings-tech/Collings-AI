import React, { useState, useEffect } from 'react';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ChatPage from './pages/ChatPage';
import SeoDashboardPage from './pages/SeoDashboardPage';
import useAppStore from './store/appStore';
import UpdateBanner from './components/UpdateBanner';

export default function App() {
  const [page, setPage] = useState('loading');
  const { user, setUser, activeSite, theme } = useAppStore();
  const isDark = theme === 'dark';

  // Apply theme class to <html> on mount and whenever theme changes
  useEffect(() => {
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add(theme);
  }, [theme]);

  useEffect(() => {
    window.electronAPI
      .invoke('auth:check')
      .then((result) => {
        if (result?.user) {
          setUser(result.user);
          setPage('dashboard');
        } else {
          setPage('login');
        }
      })
      .catch(() => setPage('login'));
  }, []);

  function renderPage() {
    if (page === 'loading') {
      return (
        <div className={`flex items-center justify-center h-screen ${isDark ? 'bg-gray-900' : 'bg-gray-100'}`}>
          <div className="flex flex-col items-center gap-4">
            <img src={isDark ? './collings-logo-white.png' : './collings-logo-1.png'} alt="Collings AI" className="h-10 w-auto animate-pulse" />
            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Loading...</p>
          </div>
        </div>
      );
    }

    if (page === 'login' || !user) {
      return <LoginPage onSuccess={() => setPage('dashboard')} />;
    }

    if (page === 'chat' && activeSite) {
      return <ChatPage onBack={() => setPage('dashboard')} />;
    }

    if (page === 'seoDashboard') {
      return <SeoDashboardPage onBack={() => setPage('dashboard')} />;
    }

    return (
      <DashboardPage
        onSelectSite={() => setPage('chat')}
        onLogout={() => setPage('login')}
        onSeoReports={() => setPage('seoDashboard')}
      />
    );
  }

  return (
    <>
      <UpdateBanner />
      {renderPage()}
    </>
  );
}
