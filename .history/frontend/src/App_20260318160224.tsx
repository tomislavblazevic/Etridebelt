import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const REACT_API = process.env.REACT_APP_API_URL && process.env.REACT_APP_API_URL.trim();
const IS_LOCALHOST = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const USE_BACKEND = !!REACT_API || IS_LOCALHOST;
const API_URL = REACT_API || (IS_LOCALHOST ? 'http://localhost:5000/todos' : '');
const USE_LOCAL_STORAGE = !USE_BACKEND; // on GitHub Pages use localStorage for full functionality

interface Todo {
  id: number;
  text: string;
  completed: boolean;
}

function App() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [fallbackLocal, setFallbackLocal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (USE_LOCAL_STORAGE) {
      const stored = localStorage.getItem('todos');
      if (stored) {
        try {
          setTodos(JSON.parse(stored) as Todo[]);
          return;
        } catch (e) {
          // fall through to fetch static file
        }
      }
      // try load static todos.json once
      axios.get<Todo[]>(`${process.env.PUBLIC_URL || ''}/todos.json`).then((response) => {
        setTodos(response.data as Todo[]);
        localStorage.setItem('todos', JSON.stringify(response.data));
      }).catch(() => setTodos([]));
      return;
    }

    axios.get<Todo[]>(API_URL).then((response) => {
      setTodos(response.data as Todo[]);
    }).catch(() => {
      // Backend not reachable: fall back to localStorage and inform the user
      setErrorMessage('Backend unavailable — using localStorage fallback');
      setFallbackLocal(true);
      const stored = localStorage.getItem('todos');
      if (stored) {
        try {
          setTodos(JSON.parse(stored) as Todo[]);
          return;
        } catch (e) {
          // fall through to fetch static file
        }
      }
      axios.get<Todo[]>(`${process.env.PUBLIC_URL || ''}/todos.json`).then((response) => {
        setTodos(response.data as Todo[]);
        localStorage.setItem('todos', JSON.stringify(response.data));
      }).catch(() => setTodos([]));
    });
  }, []);

  const persist = (nextTodos: Todo[]) => {
    setTodos(nextTodos);
    if (USE_LOCAL_STORAGE || fallbackLocal) localStorage.setItem('todos', JSON.stringify(nextTodos));
  };

  const addTodo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    if (USE_LOCAL_STORAGE || fallbackLocal) {
      const next: Todo = { id: Date.now(), text, completed: false };
      persist([...todos, next]);
      setText('');
      return;
    }
    axios.post<Todo>(API_URL, { text }).then((response) => {
      setTodos([...todos, response.data]);
      setText('');
    }).catch(() => {
      // If POST fails, fallback to local storage and notify
      setErrorMessage('Failed to reach backend; saved locally instead');
      setFallbackLocal(true);
      const next: Todo = { id: Date.now(), text, completed: false };
      persist([...todos, next]);
      setText('');
    });
  };

  const deleteTodo = (id: number) => {
    if (USE_LOCAL_STORAGE || fallbackLocal) {
      persist(todos.filter((todo) => todo.id !== id));
      return;
    }
    axios.delete(`${API_URL}/${id}`).then(() => {
      setTodos(todos.filter((todo) => todo.id !== id));
    }).catch(() => {
      setErrorMessage('Failed to reach backend; delete applied locally');
      setFallbackLocal(true);
      persist(todos.filter((todo) => todo.id !== id));
    });
  };

  const startEditing = (id: number, currentText: string) => {
    setEditingId(id);
    setEditText(currentText);
  };

  const saveEdit = (id: number) => {
    if (USE_LOCAL_STORAGE || fallbackLocal) {
      persist(todos.map((todo) => (todo.id === id ? { ...todo, text: editText } : todo)));
      setEditingId(null);
      setEditText('');
      return;
    }
    axios.put<Todo>(`${API_URL}/${id}`, { text: editText }).then((response) => {
      setTodos(
        todos.map((todo) => (todo.id === id ? response.data : todo))
      );
      setEditingId(null);
      setEditText('');
    }).catch(() => {
      setErrorMessage('Failed to reach backend; edit saved locally');
      setFallbackLocal(true);
      persist(todos.map((todo) => (todo.id === id ? { ...todo, text: editText } : todo)));
      setEditingId(null);
      setEditText('');
    });
  };

  const toggleCompleted = (id: number, completed: boolean) => {
    if (USE_LOCAL_STORAGE || fallbackLocal) {
      persist(todos.map((todo) => (todo.id === id ? { ...todo, completed: !completed } : todo)));
      return;
    }
    axios.put<Todo>(`${API_URL}/${id}`, { completed: !completed }).then((response) => {
        setTodos(
            todos.map((todo) => (todo.id === id ? response.data : todo))
        );
    }).catch(() => {
      setErrorMessage('Failed to reach backend; change applied locally');
      setFallbackLocal(true);
      persist(todos.map((todo) => (todo.id === id ? { ...todo, completed: !completed } : todo)));
    });
  };


  return (
    <div className="container">
      {errorMessage && (
        <div className="alert-fallback" role="alert">
          {errorMessage}
        </div>
      )}
      <h1 className="my-4">Todo List</h1>
      <form onSubmit={addTodo} className="mb-3">
        <div className="input-group">
          <input
            type="text"
            className="form-control"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a new todo"
          />
          <button type="submit" className="btn btn-primary">
            Add
          </button>
        </div>
      </form>
      <ul className="list-group">
        {todos.map((todo) => (
          <li
            key={todo.id}
            className="list-group-item d-flex justify-content-between align-items-center"
          >
            {editingId === todo.id ? (
              <input
                type="text"
                className="form-control"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
              />
            ) : (
              <span
                onClick={() => toggleCompleted(todo.id, todo.completed)}
                style={{
                  textDecoration: todo.completed ? 'line-through' : 'none',
                  cursor: 'pointer',
                }}
              >
                {todo.text}
              </span>
            )}
            <div>
              {editingId === todo.id ? (
                <button
                  onClick={() => saveEdit(todo.id)}
                  className="btn btn-success btn-sm me-2"
                >
                  Save
                </button>
              ) : (
                <button
                  onClick={() => startEditing(todo.id, todo.text)}
                  className="btn btn-warning btn-sm me-2"
                >
                  Edit
                </button>
              )}
              <button
                onClick={() => deleteTodo(todo.id)}
                className="btn btn-danger btn-sm"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;
