export const MAX_TODO_LENGTH = 500;
export const MAX_TODOS = 100;

export function normalizeTodoText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function validateTodoText(value: string): string | null {
  const text = normalizeTodoText(value);
  if (!text) return 'Todo cannot be empty.';
  if (text.length > MAX_TODO_LENGTH) {
    return `Todo text is too long (maximum ${MAX_TODO_LENGTH} characters).`;
  }
  return null;
}
