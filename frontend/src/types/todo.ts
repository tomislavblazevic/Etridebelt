export interface Todo {
  id: string;
  text: string;
  completed: boolean;
}

export interface SyncOperation {
  id: string;
  type: 'create' | 'update' | 'delete';
  todo: Todo;
  createdAt: number;
}
