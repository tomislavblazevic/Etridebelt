import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const API_URL = 'http://localhost:5000/todos';

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

  useEffect(() => {
    axios.get<Todo[]>(API_URL).then((response) => {
      setTodos(response.data);
    });
  }, []);

  const addTodo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    axios.post<Todo>(API_URL, { text }).then((response) => {
      setTodos([...todos, response.data]);
      setText('');
    });
  };

  const deleteTodo = (id: number) => {
    axios.delete(`${API_URL}/${id}`).then(() => {
      setTodos(todos.filter((todo) => todo.id !== id));
    });
  };

  const startEditing = (id: number, currentText: string) => {
    setEditingId(id);
    setEditText(currentText);
  };

  const saveEdit = (id: number) => {
    axios.put<Todo>(`${API_URL}/${id}`, { text: editText }).then((response) => {
      setTodos(
        todos.map((todo) => (todo.id === id ? response.data : todo))
      );
      setEditingId(null);
      setEditText('');
    });
  };

  const toggleCompleted = (id: number, completed: boolean) => {
    axios.put<Todo>(`${API_URL}/${id}`, { completed: !completed }).then((response) => {
        setTodos(
            todos.map((todo) => (todo.id === id ? response.data : todo))
        );
    });
  };


  return (
    <div className="container">
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
