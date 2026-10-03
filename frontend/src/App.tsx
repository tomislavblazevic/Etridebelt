import { FormEvent, useCallback, useEffect, useState } from 'react';
import { apiEnabled, createTodo, fetchTodos, getCurrentUser, logout, removeTodo, updateTodo } from './api/todos';
import type { User } from './api/todos';
import { AuthScreen } from './components/AuthScreen';
import { TodoItem } from './components/TodoItem';
import { useTheme } from './hooks/useTheme';
import { MAX_TODOS, validateTodoText } from './lib/validation';
import { clearLocalData, deleteTodo as deleteLocalTodo, enqueue, getQueue, getTodos, putTodo, removeQueueItem, replaceTodos } from './lib/storage';
import type { SyncOperation, Todo } from './types/todo';
import './App.css';

const STATIC_TODOS_URL = `${import.meta.env.BASE_URL}todos.json`;

function makeTodo(text: string): Todo {
  return { id: crypto.randomUUID(), text: text.trim(), completed: false };
}

function App() {
  const { theme, toggleTheme } = useTheme();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(apiEnabled);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [message, setMessage] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const markBusy = (id: string, busy: boolean) => {
    setBusyIds((current) => {
      const next = new Set(current);
      if (busy) next.add(id); else next.delete(id);
      return next;
    });
  };

  useEffect(() => {
    if (!apiEnabled) { setAuthLoading(false); return; }
    void getCurrentUser().then((currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    }).catch(() => setAuthLoading(false));
  }, []);

  const handleAuthenticated = useCallback(async () => {
    const currentUser = await getCurrentUser();
    setUser(currentUser);
    await clearLocalData();
    setTodos([]);
  }, []);

  const handleLogout = useCallback(async () => {
    try { await logout(); } finally {
      await clearLocalData();
      setTodos([]);
      setUser(null);
    }
  }, []);

  const loadLocal = useCallback(async () => {
    const local = await getTodos();
    if (local.length) {
      setTodos(local);
      return local;
    }

    // Never seed authenticated users with public/demo data.
    if (apiEnabled) {
      setTodos([]);
      return [];
    }

    try {
      const response = await fetch(STATIC_TODOS_URL, { cache: 'no-store' });
      if (response.ok) {
        const seed = await response.json() as Todo[];
        await replaceTodos(seed);
        setTodos(seed);
        return seed;
      }
    } catch {
      // Offline with no local data.
    }
    setTodos([]);
    return [];
  }, []);

const syncQueue = useCallback(async (): Promise<boolean> => {
  if (!apiEnabled || !navigator.onLine) return true;

  const queue = await getQueue();
  if (!queue.length) return true;

  setSyncing(true);

  let failed = false;

  try {
    for (const operation of queue) {
      try {
        if (operation.type === 'create') {
          const remote = await createTodo(operation.todo);

          await deleteLocalTodo(operation.todo.id);
          await putTodo(remote);

          setTodos((current) =>
            current.map((todo) =>
              todo.id === operation.todo.id ? remote : todo,
            ),
          );
        } else if (operation.type === 'update') {
          const remote = await updateTodo(operation.todo);

          await putTodo(remote);

          setTodos((current) =>
            current.map((todo) =>
              todo.id === remote.id ? remote : todo,
            ),
          );
        } else {
          await removeTodo(operation.todo.id);
          await deleteLocalTodo(operation.todo.id);

          setTodos((current) =>
            current.filter((todo) => todo.id !== operation.todo.id),
          );
        }

        await removeQueueItem(operation.id);
      } catch (error) {
        failed = true;
        console.error('Sync operation failed:', operation, error);
      }
    }

    return !failed;
  } finally {
    setSyncing(false);
  }
}, []);

const refreshFromServer = useCallback(async () => {
  if (!apiEnabled || !navigator.onLine || !user) return false;

  const syncSucceeded = await syncQueue();
  const remainingQueue = await getQueue();

  try {
    const remote = await fetchTodos();

    const failedOperations = remainingQueue.filter(
      (operation) =>
        operation.type === 'create' ||
        operation.type === 'update' ||
        operation.type === 'delete',
    );

    const merged = new Map(remote.map((todo) => [todo.id, todo]));

    for (const operation of failedOperations) {
      if (operation.type === 'delete') {
        merged.delete(operation.todo.id);
      } else {
        merged.set(operation.todo.id, operation.todo);
      }
    }

    const mergedTodos = Array.from(merged.values()).sort((a, b) =>
      a.id.localeCompare(b.id),
    );

    await replaceTodos(mergedTodos);
    setTodos(mergedTodos);

    if (syncSucceeded && remainingQueue.length === 0) {
      setMessage(null);
    } else if (remainingQueue.length > 0) {
      setMessage('Neke promjene još čekaju sinkronizaciju.');
    } else {
      setMessage(null);
    }

    return true;
  } catch (error) {
    console.error('Unable to refresh todos from server:', error);
    return false;
  }
}, [syncQueue, user]);

  useEffect(() => {
    if (apiEnabled && !user) return;
    let cancelled = false;
    void (async () => {
      const local = await loadLocal();
      if (cancelled) return;
      setLoading(false);
      if (apiEnabled && navigator.onLine) {
        const ok = await refreshFromServer();
        if (!ok && local.length) setMessage('Server unavailable. Working offline; changes will sync automatically.');
      } else if (!apiEnabled) {
        setMessage('Offline/local mode: changes are stored on this device.');
      } else {
        setMessage('You are offline. Changes will sync when the connection returns.');
      }
    })();
    return () => { cancelled = true; };
  }, [loadLocal, refreshFromServer, user]);

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      void refreshFromServer();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [refreshFromServer]);

  useEffect(() => {
    if (!apiEnabled || !user) return;

    const intervalId = window.setInterval(() => {
      if (navigator.onLine && !syncing) {
      void refreshFromServer();
    }
    }, 10_000);

    return () => {
      window.clearInterval(intervalId);
  };
}, [refreshFromServer, syncing, user]);

  const saveLocalAndQueue = async (operation: SyncOperation, nextTodos: Todo[]) => {
    await replaceTodos(nextTodos);
    setTodos(nextTodos);
    if (apiEnabled) {
      await enqueue(operation);
      void syncQueue();
    }
  };

  const addTodo = async (event: FormEvent) => {
    event.preventDefault();
    const validationError = validateTodoText(text);
    if (validationError) {
      setMessage(validationError);
      return;
    }
    if (todos.length >= MAX_TODOS) {
      setMessage(`Maximum of ${MAX_TODOS} todos reached.`);
      return;
    }
    const todo = makeTodo(text);
    setText('');
    markBusy(todo.id, true);
    try {
      if (apiEnabled && online) {
        try {
          const remote = await createTodo(todo);
          await putTodo(remote);
          setTodos((current) => [...current, remote]);
          return;
        } catch {
          setMessage('Server unavailable. Todo saved locally and queued for sync.');
        }
      }
      await saveLocalAndQueue({ id: crypto.randomUUID(), type: 'create', todo, createdAt: Date.now() }, [...todos, todo]);
    } finally {
      markBusy(todo.id, false);
    }
  };

  const toggleTodo = async (todo: Todo) => {
    const updated = { ...todo, completed: !todo.completed };
    markBusy(todo.id, true);
    try {
      if (apiEnabled && online) {
        try {
          const remote = await updateTodo(updated);
          await putTodo(remote);
          setTodos((current) => current.map((item) => item.id === todo.id ? remote : item));
          return;
        } catch {
          setMessage('Server unavailable. Change saved locally and queued for sync.');
        }
      }
      await saveLocalAndQueue({ id: crypto.randomUUID(), type: 'update', todo: updated, createdAt: Date.now() }, todos.map((item) => item.id === todo.id ? updated : item));
    } finally {
      markBusy(todo.id, false);
    }
  };

  const saveTodo = async (todo: Todo) => {
    markBusy(todo.id, true);
    try {
      if (apiEnabled && online) {
        try {
          const remote = await updateTodo(todo);
          await putTodo(remote);
          setTodos((current) => current.map((item) => item.id === todo.id ? remote : item));
          return;
        } catch {
          setMessage('Server unavailable. Edit saved locally and queued for sync.');
        }
      }
      await saveLocalAndQueue({ id: crypto.randomUUID(), type: 'update', todo, createdAt: Date.now() }, todos.map((item) => item.id === todo.id ? todo : item));
    } finally {
      markBusy(todo.id, false);
    }
  };

  const deleteTodo = async (todo: Todo) => {
    markBusy(todo.id, true);
    try {
      if (apiEnabled && online) {
        try {
          await removeTodo(todo.id);
          await deleteLocalTodo(todo.id);
          setTodos((current) => current.filter((item) => item.id !== todo.id));
          return;
        } catch {
          setMessage('Server unavailable. Delete saved locally and queued for sync.');
        }
      }
      const next = todos.filter((item) => item.id !== todo.id);
      await saveLocalAndQueue({ id: crypto.randomUUID(), type: 'delete', todo, createdAt: Date.now() }, next);
    } finally {
      markBusy(todo.id, false);
    }
  };

  if (authLoading) return <main className="auth-shell"><section className="auth-card" role="status">Loading your account…</section></main>;
  if (apiEnabled && !user) return <AuthScreen onAuthenticated={() => void handleAuthenticated()} />;

  return (
    <main className="app-shell">
      <section className="app-card" aria-labelledby="app-title">
        <header className="app-header">
          <div>
            <p className="eyebrow">ETRIDEBELT</p>
            <h1 id="app-title">Todo List</h1>
            <p className="subtitle">Fast, resilient and ready for offline work.</p>
          </div>
          <div className="header-actions">
            <button type="button" className="theme-button" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
              {theme === 'dark' ? '☀ Light' : '☾ Dark'}
            </button>
            {apiEnabled && user && <button type="button" className="theme-button" onClick={() => void handleLogout()}>Sign out</button>}
          </div>
        </header>

        {message && (
          <div className="status-banner" role="status">
            <span>{message}</span>
            <button type="button" onClick={() => setMessage(null)} aria-label="Dismiss message">×</button>
          </div>
        )}

        <div className="connection-row" aria-live="polite">
          <span className={`connection-dot ${online && apiEnabled ? 'online' : 'offline'}`} aria-hidden="true" />
          <span>{apiEnabled ? (online ? 'Connected to server' : 'Offline mode') : 'Local mode'}</span>
          {syncing && <span className="syncing">Syncing…</span>}
        </div>

        <form onSubmit={addTodo} className="todo-form">
          <label className="sr-only" htmlFor="new-todo">New todo</label>
          <input
            id="new-todo"
            className="text-input"
            type="text"
            value={text}
            maxLength={500}
            onChange={(event) => setText(event.target.value)}
            placeholder="Add a new todo"
            autoComplete="off"
          />
          <button className="primary-button" type="submit" disabled={loading || !text.trim()}>Add</button>
        </form>

        {loading ? (
          <div className="empty-state" role="status">Loading your todos…</div>
        ) : todos.length === 0 ? (
          <div className="empty-state">No todos yet. Add your first task above.</div>
        ) : (
          <ul className="todo-list" aria-label="Todo list">
            {todos.map((todo) => (
              <TodoItem key={todo.id} todo={todo} busy={busyIds.has(todo.id)} onToggle={toggleTodo} onSave={saveTodo} onDelete={deleteTodo} />
            ))}
          </ul>
        )}

        <footer className="app-footer">
          <span>{todos.length} / {MAX_TODOS} todos</span>
          {apiEnabled && <button type="button" className="link-button" onClick={() => void refreshFromServer()} disabled={!online || syncing}>Sync now</button>}
        </footer>
      </section>
    </main>
  );
}

export default App;
