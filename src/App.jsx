import React, { useState, useEffect, useMemo } from 'react';

const getInitialApiUrl = () => {
  // Check for Vite environment variables first
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  // Fallback for Create React App or Node environments
  if (typeof process !== 'undefined' && process.env && process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }
  // Default fallback for local development
  return 'http://localhost:5000';
};

const FILTERS = [
  { key: 'all', label: 'All', emoji: '📋' },
  { key: 'active', label: 'To do', emoji: '⏳' },
  { key: 'completed', label: 'Done', emoji: '✅' },
];

// Shared style snippets (blue & pink theme)
const inputClass =
  'w-full rounded-2xl border-2 border-sky-100 bg-white px-4 py-3 text-base text-slate-800 placeholder-slate-400 transition focus:border-sky-400 focus:outline-none focus:ring-4 focus:ring-sky-100';
const iconBtnClass =
  'flex h-10 w-10 items-center justify-center rounded-xl border border-sky-100 bg-white text-lg shadow-sm transition hover:border-pink-200 hover:bg-pink-50 focus:outline-none focus:ring-4 focus:ring-pink-100';
const modalBackdropClass =
  'fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm';

export default function App() {
  // Auth State
  const [token, setToken] = useState(localStorage.getItem('taskflow_token') || null);
  const [currentUser, setCurrentUser] = useState(localStorage.getItem('taskflow_user') || null);
  const [isAuthMode, setIsAuthMode] = useState('login'); // 'login' | 'register'
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  // Todo State
  const [todos, setTodos] = useState([]);
  const [newTodoText, setNewTodoText] = useState('');
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [deleteCandidate, setDeleteCandidate] = useState(null);

  // Settings & Network State
  const [apiUrl, setApiUrl] = useState(getInitialApiUrl);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [pendingApiUrl, setPendingApiUrl] = useState(getInitialApiUrl);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const getHeaders = () => ({
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  });

  const openSettings = () => {
    setPendingApiUrl(apiUrl);
    setIsSettingsOpen(true);
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    setIsAuthLoading(true);

    const endpoint = isAuthMode === 'login' ? '/api/auth/login' : '/api/auth/register';

    try {
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail, password: authPassword }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      setToken(data.token);
      setCurrentUser(data.email);
      localStorage.setItem('taskflow_token', data.token);
      localStorage.setItem('taskflow_user', data.email);
      setAuthPassword('');
      setAuthEmail('');
      setIsConnected(true);
      setConnectionError(false);
    } catch (err) {
      setAuthError(
        err instanceof TypeError
          ? "Can't reach the server. Please check the Backend URL in ⚙️ Settings."
          : err.message
      );
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setCurrentUser(null);
    setTodos([]);
    localStorage.removeItem('taskflow_token');
    localStorage.removeItem('taskflow_user');
  };

  const fetchTodos = async (targetUrl = apiUrl) => {
    if (!token) return;
    setIsLoading(true);
    try {
      const response = await fetch(`${targetUrl.replace(/\/$/, '')}/api/todos`, {
        method: 'GET',
        headers: getHeaders(),
      });

      if (response.status === 401) {
        handleLogout();
        throw new Error('Session expired');
      }

      if (!response.ok) throw new Error('Failed to fetch data');

      const data = await response.json();
      setTodos(data);
      setIsConnected(true);
      setConnectionError(false);
    } catch (err) {
      console.warn('Backend issue:', err.message);
      setIsConnected(false);
      setConnectionError(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchTodos(apiUrl);
  }, [apiUrl, token]);

  const handleAddTodo = async (e) => {
    e.preventDefault();
    const trimmed = newTodoText.trim();
    if (!trimmed) return;

    const tempId = `local-${Date.now()}`;
    const newTodo = { _id: tempId, text: trimmed, completed: false, createdAt: new Date().toISOString() };
    setTodos((prev) => [newTodo, ...prev]);
    setNewTodoText('');

    try {
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/api/todos`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ text: trimmed }),
      });

      if (response.status === 401) return handleLogout();
      if (!response.ok) throw new Error('Failed to create on server');

      const savedTodo = await response.json();
      setTodos((prev) => prev.map((t) => (t._id === tempId ? savedTodo : t)));
    } catch (err) {
      console.error('Error saving todo:', err);
      // Remove temp item on failure
      setTodos((prev) => prev.filter((t) => t._id !== tempId));
    }
  };

  const handleToggleTodo = async (todo) => {
    const updatedStatus = !todo.completed;
    setTodos((prev) => prev.map((t) => (t._id === todo._id ? { ...t, completed: updatedStatus } : t)));

    try {
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/api/todos/${todo._id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ completed: updatedStatus }),
      });
      if (response.status === 401) handleLogout();
    } catch (err) {
      setTodos((prev) => prev.map((t) => (t._id === todo._id ? { ...t, completed: todo.completed } : t)));
    }
  };

  const handleStartEdit = (todo) => {
    setEditingId(todo._id);
    setEditingText(todo.text);
  };

  const handleSaveEdit = async (id) => {
    const trimmed = editingText.trim();
    if (!trimmed) return;

    const previousTodos = [...todos];
    setTodos((prev) => prev.map((t) => t._id === id ? { ...t, text: trimmed, updatedAt: new Date().toISOString() } : t));
    setEditingId(null);

    try {
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/api/todos/${id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ text: trimmed }),
      });
      if (response.status === 401) handleLogout();
      if (!response.ok) throw new Error('Update failed');
    } catch (err) {
      setTodos(previousTodos);
    }
  };

  const confirmDelete = async () => {
    if (!deleteCandidate) return;
    const targetId = deleteCandidate._id;
    setTodos((prev) => prev.filter((t) => t._id !== targetId));
    setDeleteCandidate(null);

    try {
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/api/todos/${targetId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (response.status === 401) handleLogout();
    } catch (err) {
      console.error('Error deleting:', err);
    }
  };

  const formatDateTime = (isoDate) => {
    if (!isoDate) return '';
    try {
      return new Date(isoDate).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch { return ''; }
  };

  const filteredTodos = useMemo(() => {
    const result = todos.filter((todo) => {
      const matchesFilter = filter === 'all' ? true : filter === 'active' ? !todo.completed : todo.completed;
      const matchesSearch = todo.text.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesFilter && matchesSearch;
    });

    return [...result].sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      if (sortBy === 'oldest') return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      if (sortBy === 'az') return a.text.localeCompare(b.text, undefined, { sensitivity: 'base' });
      if (sortBy === 'za') return b.text.localeCompare(a.text, undefined, { sensitivity: 'base' });
      if (sortBy === 'status') return Number(a.completed) - Number(b.completed);
      return 0;
    });
  }, [todos, filter, searchQuery, sortBy]);

  const stats = useMemo(() => {
    const total = todos.length;
    const done = todos.filter((t) => t.completed).length;
    const pending = total - done;
    const percent = total ? Math.round((done / total) * 100) : 0;
    return { total, done, pending, percent };
  }, [todos]);

  const counts = { all: stats.total, active: stats.pending, completed: stats.done };

  const greetingName = currentUser ? currentUser.split('@')[0] : '';
  const greetingText =
    stats.total === 0
      ? 'Ready to plan your day? Add your first task below 👇'
      : stats.pending === 0
        ? 'All tasks done. Great job! 🎉'
        : `You have ${stats.pending} task${stats.pending > 1 ? 's' : ''} left to do 💪`;

  /* ---------- Shared: API settings modal ---------- */
  const renderSettingsModal = () =>
    isSettingsOpen && (
      <div className={modalBackdropClass} onClick={() => setIsSettingsOpen(false)}>
        <div
          className="relative w-full max-w-md rounded-3xl border border-sky-100 bg-white p-6 shadow-2xl shadow-sky-200/60"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => setIsSettingsOpen(false)}
            aria-label="Close"
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-pink-50 hover:text-pink-500"
          >
            ✖️
          </button>
          <h2 className="text-lg font-extrabold text-slate-800">⚙️ Settings</h2>
          <div className="mt-5 flex flex-col gap-2">
            <label htmlFor="api-url" className="text-sm font-bold text-slate-600">🔗 Backend URL</label>
            <input
              id="api-url"
              type="text"
              value={pendingApiUrl}
              onChange={(e) => setPendingApiUrl(e.target.value)}
              className={`${inputClass} font-mono !text-sm`}
            />
            <p className="text-xs text-slate-500">Where your TaskFlow API is running, e.g. http://localhost:5000</p>
          </div>
          <div className="mt-6 flex justify-end gap-2.5">
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-500 transition hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              onClick={() => { setApiUrl(pendingApiUrl); setIsSettingsOpen(false); }}
              className="btn-grad rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-pink-200 transition active:scale-95"
            >
              💾 Save
            </button>
          </div>
        </div>
      </div>
    );

  /* ---------- Login / Register ---------- */
  if (!token) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center p-4 selection:bg-pink-200">
        <button
          onClick={openSettings}
          title="Settings"
          aria-label="Settings"
          className={`${iconBtnClass} absolute right-5 top-5`}
        >
          ⚙️
        </button>

        <div className="w-full max-w-sm rounded-3xl border border-white bg-white/80 p-8 shadow-2xl shadow-sky-200/60 backdrop-blur">
          <div className="mb-5 flex justify-center">
            <div className="btn-grad flex h-16 w-16 items-center justify-center rounded-2xl text-3xl shadow-lg shadow-pink-200">
              📝
            </div>
          </div>
          <h1 className="text-grad text-center text-3xl font-extrabold">TaskFlow</h1>
          <p className="mb-7 mt-2 text-center text-sm text-slate-500">
            {isAuthMode === 'login'
              ? '👋 Welcome back! Sign in to see your tasks.'
              : '✨ Create an account to get started.'}
          </p>

          <form onSubmit={handleAuth} className="flex flex-col gap-4">
            {authError && (
              <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-600">
                ⚠️ {authError}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="auth-email" className="text-sm font-bold text-slate-600">📧 Email</label>
              <input
                id="auth-email"
                type="email"
                required
                autoComplete="email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="you@example.com"
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="auth-password" className="text-sm font-bold text-slate-600">🔒 Password</label>
              <div className="relative">
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete={isAuthMode === 'login' ? 'current-password' : 'new-password'}
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="Your password"
                  className={`${inputClass} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-lg transition hover:bg-sky-50"
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isAuthLoading}
              className="btn-grad mt-2 w-full rounded-2xl py-3.5 text-base font-extrabold text-white shadow-lg shadow-pink-200 transition active:scale-[0.98] disabled:opacity-60"
            >
              {isAuthLoading
                ? '⏳ Please wait...'
                : isAuthMode === 'login'
                  ? 'Sign In 🚀'
                  : 'Create Account 🎉'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm">
            <span className="text-slate-500">
              {isAuthMode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            </span>
            <button
              onClick={() => { setIsAuthMode(isAuthMode === 'login' ? 'register' : 'login'); setAuthError(''); }}
              className="font-bold text-sky-600 underline-offset-2 transition hover:text-pink-500 hover:underline"
            >
              {isAuthMode === 'login' ? 'Sign up' : 'Log in'}
            </button>
          </div>
        </div>

        {renderSettingsModal()}
      </div>
    );
  }

  /* ---------- Main app ---------- */
  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-6 selection:bg-pink-200 sm:px-6 sm:py-10">
      <div className="flex w-full max-w-2xl flex-col gap-5">

        {/* Header */}
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="btn-grad flex h-12 w-12 items-center justify-center rounded-2xl text-2xl shadow-lg shadow-pink-200">
              📝
            </div>
            <h1 className="text-grad text-2xl font-extrabold tracking-tight sm:text-3xl">TaskFlow</h1>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => fetchTodos(apiUrl)} title="Refresh" aria-label="Refresh" className={iconBtnClass}>
              <span className={isLoading ? 'inline-block animate-spin' : ''}>🔄</span>
            </button>
            <button onClick={openSettings} title="Settings" aria-label="Settings" className={iconBtnClass}>
              ⚙️
            </button>
            <button
              onClick={handleLogout}
              title="Log out"
              className="flex h-10 items-center gap-1.5 rounded-xl border border-pink-200 bg-pink-50 px-3 text-sm font-bold text-pink-600 shadow-sm transition hover:bg-pink-100 focus:outline-none focus:ring-4 focus:ring-pink-100"
            >
              <span aria-hidden="true">🚪</span>
              <span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        </header>

        {/* Connection problem */}
        {connectionError && (
          <div role="alert" className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-800">
            <span aria-hidden="true">⚠️</span>
            <span>
              Can't reach the server. Check the Backend URL in ⚙️ Settings, then tap 🔄 to try again.
            </span>
          </div>
        )}

        {/* Summary card */}
        <section className="rounded-3xl border border-white bg-white/80 p-5 shadow-xl shadow-sky-200/50 backdrop-blur">
          <h2 className="text-xl font-extrabold text-slate-800">
            Hi, {greetingName} 👋
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">{greetingText}</p>
          <p className="mt-0.5 truncate text-xs text-slate-400">👤 {currentUser}</p>

          <div className="mt-4 grid grid-cols-3 gap-2.5 text-center">
            <div className="rounded-2xl bg-sky-50 px-2 py-3">
              <div className="text-2xl font-extrabold text-sky-600">{stats.total}</div>
              <div className="text-xs font-semibold text-sky-700/70">📋 Total</div>
            </div>
            <div className="rounded-2xl bg-violet-50 px-2 py-3">
              <div className="text-2xl font-extrabold text-violet-500">{stats.pending}</div>
              <div className="text-xs font-semibold text-violet-600/70">⏳ To do</div>
            </div>
            <div className="rounded-2xl bg-pink-50 px-2 py-3">
              <div className="text-2xl font-extrabold text-pink-500">{stats.done}</div>
              <div className="text-xs font-semibold text-pink-600/70">✅ Done</div>
            </div>
          </div>

          {stats.total > 0 && (
            <div className="mt-4">
              <div className="mb-1.5 flex justify-between text-xs font-semibold text-slate-500">
                <span>🎯 Progress</span>
                <span>{stats.percent}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="btn-grad h-full rounded-full transition-all duration-500"
                  style={{ width: `${stats.percent}%` }}
                />
              </div>
            </div>
          )}
        </section>

        {/* Add task */}
        <form onSubmit={handleAddTodo}>
          <div className="flex items-center gap-2 rounded-3xl border-2 border-white bg-white p-2 shadow-xl shadow-pink-200/40 transition focus-within:border-sky-300 focus-within:ring-4 focus-within:ring-sky-100">
            <input
              type="text"
              value={newTodoText}
              onChange={(e) => setNewTodoText(e.target.value)}
              placeholder="✏️ What do you want to do today?"
              aria-label="New task"
              className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-base text-slate-800 placeholder-slate-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!newTodoText.trim()}
              className="btn-grad flex items-center gap-1.5 rounded-2xl px-5 py-3 text-sm font-extrabold text-white shadow-md shadow-pink-200 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span aria-hidden="true">➕</span> Add
            </button>
          </div>
        </form>

        {/* Filters, sort & search (only when there is something to filter) */}
        {todos.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex rounded-2xl border border-sky-100 bg-white p-1 shadow-sm">
              {FILTERS.map(({ key, label, emoji }) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`flex-1 rounded-xl px-2 py-2 text-sm font-bold transition ${
                    filter === key
                      ? 'btn-grad text-white shadow-md shadow-pink-200'
                      : 'text-slate-500 hover:bg-sky-50 hover:text-sky-600'
                  }`}
                >
                  <span aria-hidden="true">{emoji}</span> {label}{' '}
                  <span className={filter === key ? 'text-white/80' : 'text-slate-400'}>({counts[key]})</span>
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2.5 sm:flex-row">
              <div className="relative flex-1">
                <span aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm">🔍</span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search tasks..."
                  aria-label="Search tasks"
                  className="w-full rounded-2xl border border-sky-100 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-700 placeholder-slate-400 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-4 focus:ring-sky-100"
                />
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                aria-label="Sort tasks"
                className="cursor-pointer rounded-2xl border border-sky-100 bg-white px-3 py-2.5 text-sm font-semibold text-slate-600 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-4 focus:ring-sky-100"
              >
                <option value="newest">🆕 Newest first</option>
                <option value="oldest">🕰️ Oldest first</option>
                <option value="status">⏳ To do first</option>
                <option value="az">🔤 A → Z</option>
                <option value="za">🔡 Z → A</option>
              </select>
            </div>
          </div>
        )}

        {/* Task list */}
        <div className="flex flex-col gap-3">
          {filteredTodos.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-sky-200 bg-white/60 px-4 py-14 text-center">
              {isLoading && todos.length === 0 ? (
                <>
                  <div className="mb-2 text-4xl">⏳</div>
                  <h3 className="text-base font-extrabold text-slate-700">Loading your tasks...</h3>
                </>
              ) : todos.length === 0 ? (
                <>
                  <div className="mb-2 text-5xl">🌈</div>
                  <h3 className="text-base font-extrabold text-slate-700">No tasks yet</h3>
                  <p className="mt-1 max-w-xs text-sm text-slate-500">Type something in the box above and press Add ☝️</p>
                </>
              ) : (
                <>
                  <div className="mb-2 text-5xl">🔍</div>
                  <h3 className="text-base font-extrabold text-slate-700">Nothing matches</h3>
                  <p className="mt-1 max-w-xs text-sm text-slate-500">Try another filter or a different search word.</p>
                </>
              )}
            </div>
          ) : (
            filteredTodos.map((todo) => {
              const formattedDate = formatDateTime(todo.createdAt || todo.timestamp);
              const isEditing = editingId === todo._id;

              return (
                <div
                  key={todo._id}
                  className={`flex items-start gap-3 rounded-2xl border p-4 transition-all ${
                    todo.completed
                      ? 'border-sky-50 bg-white/60'
                      : 'border-sky-100 bg-white shadow-md shadow-sky-100/70 hover:border-pink-200'
                  }`}
                >
                  <button
                    onClick={() => handleToggleTodo(todo)}
                    disabled={isEditing}
                    aria-label={todo.completed ? 'Mark as not done' : 'Mark as done'}
                    title={todo.completed ? 'Mark as not done' : 'Mark as done'}
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-sm font-extrabold transition ${
                      todo.completed
                        ? 'btn-grad border-transparent text-white'
                        : 'border-sky-300 bg-white text-transparent hover:border-pink-400 hover:text-pink-300'
                    }`}
                  >
                    ✓
                  </button>

                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    {isEditing ? (
                      <input
                        type="text"
                        autoFocus
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit(todo._id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        aria-label="Edit task"
                        className={inputClass}
                      />
                    ) : (
                      <p
                        onDoubleClick={() => !todo.completed && handleStartEdit(todo)}
                        className={`break-words text-base leading-snug ${
                          todo.completed ? 'text-slate-400 line-through' : 'font-semibold text-slate-800'
                        }`}
                      >
                        {todo.text}
                      </p>
                    )}
                    {formattedDate && !isEditing && (
                      <div className="text-xs text-slate-400">
                        🕒 {formattedDate} {todo.updatedAt && '· ✏️ edited'}
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {isEditing ? (
                      <>
                        <button
                          onClick={() => handleSaveEdit(todo._id)}
                          aria-label="Save"
                          title="Save"
                          className="flex h-9 w-9 items-center justify-center rounded-xl text-base transition hover:bg-sky-50"
                        >
                          💾
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          aria-label="Cancel"
                          title="Cancel"
                          className="flex h-9 w-9 items-center justify-center rounded-xl text-base transition hover:bg-slate-100"
                        >
                          ✖️
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => handleStartEdit(todo)}
                          aria-label="Edit task"
                          title="Edit"
                          className="flex h-9 w-9 items-center justify-center rounded-xl text-base transition hover:bg-sky-50"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => setDeleteCandidate(todo)}
                          aria-label="Delete task"
                          title="Delete"
                          className="flex h-9 w-9 items-center justify-center rounded-xl text-base transition hover:bg-pink-50"
                        >
                          🗑️
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {todos.length > 0 && (
          <p className="pb-4 text-center text-xs text-slate-400">
            💡 Tip: double-click a task to edit it, press Enter to save
          </p>
        )}
      </div>

      {renderSettingsModal()}

      {/* Delete confirmation */}
      {deleteCandidate && (
        <div className={modalBackdropClass} onClick={() => setDeleteCandidate(null)}>
          <div
            className="w-full max-w-sm rounded-3xl border border-pink-100 bg-white p-6 shadow-2xl shadow-pink-200/60"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 text-4xl">🗑️</div>
            <h3 className="text-lg font-extrabold text-slate-800">Delete this task?</h3>
            <p className="mb-5 mt-1 break-words rounded-xl bg-pink-50 px-3 py-2 text-sm text-slate-600">
              “{deleteCandidate.text}”
            </p>
            <div className="flex justify-end gap-2.5">
              <button
                onClick={() => setDeleteCandidate(null)}
                className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-500 transition hover:bg-slate-100"
              >
                Keep it
              </button>
              <button
                onClick={confirmDelete}
                className="rounded-xl bg-rose-500 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-rose-200 transition hover:bg-rose-600 active:scale-95"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}