import type { Todo } from '../types/todo';

const API_URL = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, '') || '';
export const apiEnabled = Boolean(API_URL);
let csrfToken: string | null = null;

export interface User { id: string; email: string; createdAt: string; }

async function ensureCsrf(): Promise<string> {
  if (csrfToken) return csrfToken;
  const response = await fetch(`${API_URL}/csrf`, { credentials: 'include', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Unable to initialize CSRF protection');
  const body = await response.json() as { csrfToken: string };
  csrfToken = body.csrfToken;
  return csrfToken;
}

async function request<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  if (!API_URL) throw new Error('API is not configured');
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers({ Accept: 'application/json', 'Content-Type': 'application/json', ...options.headers });
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    headers.set('X-CSRF-Token', await ensureCsrf());
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers
  });

  if (response.status === 403 && method !== 'GET' && method !== 'HEAD' && retry) {
    csrfToken = null;
    return request<T>(path, options, false);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message || `Request failed (${response.status})`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function getCurrentUser(): Promise<User | null> {
  if (!apiEnabled) return null;
  try { return (await request<{ user: User }>('/auth/me')).user; }
  catch (error) { if (error instanceof Error && error.message.includes('Authentication required')) return null; throw error; }
}

export async function register(email: string, password: string): Promise<User> {
  return (await request<{ user: User }>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) })).user;
}

export async function login(email: string, password: string): Promise<User> {
  return (await request<{ user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })).user;
}

export async function logout(): Promise<void> { await request<void>('/auth/logout', { method: 'POST' }); csrfToken = null; }
export async function fetchTodos(): Promise<Todo[]> { return request<Todo[]>('/todos'); }
export async function createTodo(todo: Todo): Promise<Todo> { return request<Todo>('/todos', { method: 'POST', body: JSON.stringify({ id: todo.id, text: todo.text, completed: todo.completed }) }); }
export async function updateTodo(todo: Todo): Promise<Todo> { return request<Todo>(`/todos/${encodeURIComponent(todo.id)}`, { method: 'PUT', body: JSON.stringify({ text: todo.text, completed: todo.completed }) }); }
export async function removeTodo(todoId: string): Promise<void> { await request<void>(`/todos/${encodeURIComponent(todoId)}`, { method: 'DELETE' }); }
export async function healthCheck(): Promise<void> { await request<{ status: string }>('/health'); }
