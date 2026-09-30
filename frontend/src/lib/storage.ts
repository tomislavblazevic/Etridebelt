import type { SyncOperation, Todo } from '../types/todo';

const DB_NAME = 'etridebelt';
const DB_VERSION = 1;
const TODO_STORE = 'todos';
const QUEUE_STORE = 'syncQueue';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TODO_STORE)) {
        db.createObjectStore(TODO_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const store = db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open local database'));
  });
  return dbPromise;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

export async function clearLocalData(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([TODO_STORE, QUEUE_STORE], 'readwrite');
  tx.objectStore(TODO_STORE).clear();
  tx.objectStore(QUEUE_STORE).clear();
  await transactionComplete(tx);
}

export async function getTodos(): Promise<Todo[]> {
  const db = await openDb();
  const tx = db.transaction(TODO_STORE, 'readonly');
  const result = await requestToPromise(tx.objectStore(TODO_STORE).getAll());
  return (result as Todo[]).sort((a, b) => a.id.localeCompare(b.id));
}

export async function replaceTodos(todos: Todo[]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(TODO_STORE, 'readwrite');
  const store = tx.objectStore(TODO_STORE);
  store.clear();
  for (const todo of todos) store.put(todo);
  await transactionComplete(tx);
}

export async function putTodo(todo: Todo): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(TODO_STORE, 'readwrite');
  tx.objectStore(TODO_STORE).put(todo);
  await transactionComplete(tx);
}

export async function deleteTodo(todoId: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(TODO_STORE, 'readwrite');
  tx.objectStore(TODO_STORE).delete(todoId);
  await transactionComplete(tx);
}

export async function enqueue(operation: SyncOperation): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(QUEUE_STORE, 'readwrite');
  tx.objectStore(QUEUE_STORE).put(operation);
  await transactionComplete(tx);
}

export async function getQueue(): Promise<SyncOperation[]> {
  const db = await openDb();
  const tx = db.transaction(QUEUE_STORE, 'readonly');
  const result = await requestToPromise(tx.objectStore(QUEUE_STORE).index('createdAt').getAll());
  return result as SyncOperation[];
}

export async function removeQueueItem(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(QUEUE_STORE, 'readwrite');
  tx.objectStore(QUEUE_STORE).delete(id);
  await transactionComplete(tx);
}

function transactionComplete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}
