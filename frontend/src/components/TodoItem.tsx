import { useEffect, useRef, useState } from 'react';
import type { Todo } from '../types/todo';
import { MAX_TODO_LENGTH, validateTodoText } from '../lib/validation';

interface Props {
  todo: Todo;
  busy: boolean;
  onToggle: (todo: Todo) => void;
  onSave: (todo: Todo) => Promise<void>;
  onDelete: (todo: Todo) => Promise<void>;
}

export function TodoItem({ todo, busy, onToggle, onSave, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(todo.text);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const save = async () => {
    const validationError = validateTodoText(value);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    await onSave({ ...todo, text: value.trim() });
    setEditing(false);
  };

  const cancel = () => {
    setValue(todo.text);
    setError(null);
    setEditing(false);
  };

  return (
    <li className={`todo-item ${todo.completed ? 'is-completed' : ''}`}>
      <div className="todo-main">
        {editing ? (
          <div className="edit-wrap">
            <input
              ref={inputRef}
              className="text-input"
              value={value}
              maxLength={MAX_TODO_LENGTH}
              aria-label="Edit todo"
              aria-invalid={Boolean(error)}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void save();
                if (event.key === 'Escape') cancel();
              }}
            />
            {error && <small className="field-error">{error}</small>}
          </div>
        ) : (
          <button
            type="button"
            className="todo-toggle"
            aria-pressed={todo.completed}
            disabled={busy}
            onClick={() => onToggle(todo)}
          >
            <span className="todo-check" aria-hidden="true">{todo.completed ? '✓' : ''}</span>
            <span className="todo-text">{todo.text}</span>
          </button>
        )}
      </div>
      <div className="todo-actions">
        {editing ? (
          <>
            <button type="button" className="icon-button success" aria-label="Save todo" disabled={busy} onClick={() => void save()}>✓</button>
            <button type="button" className="icon-button" aria-label="Cancel editing" disabled={busy} onClick={cancel}>×</button>
          </>
        ) : (
          <button type="button" className="icon-button warning" aria-label={`Edit ${todo.text}`} disabled={busy} onClick={() => setEditing(true)}>✎</button>
        )}
        <button type="button" className="icon-button danger" aria-label={`Delete ${todo.text}`} disabled={busy} onClick={() => void onDelete(todo)}>⌫</button>
      </div>
    </li>
  );
}
