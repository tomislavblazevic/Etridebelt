import { FormEvent, useState } from 'react';
import { login, register } from '../api/todos';
import './AuthScreen.css';

interface Props { onAuthenticated: () => void; }
export function AuthScreen({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(null); setBusy(true);
    try { await (mode === 'login' ? login(email, password) : register(email, password)); onAuthenticated(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Authentication failed.'); }
    finally { setBusy(false); }
  };

  return <main className="auth-shell"><section className="auth-card" aria-labelledby="auth-title">
    <p className="eyebrow">ETRIDEBELT</p><h1 id="auth-title">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
    <p className="auth-subtitle">{mode === 'login' ? 'Sign in to access your todos.' : 'Use a strong password with at least 12 characters.'}</p>
    {error && <div className="auth-error" role="alert">{error}</div>}
    <form onSubmit={submit} className="auth-form">
      <label htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
      <label htmlFor="password">Password</label><input id="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={12} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} />
      <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
    </form>
    <button type="button" className="link-button auth-switch" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}>
      {mode === 'login' ? 'Need an account? Create one' : 'Already have an account? Sign in'}
    </button>
  </section></main>;
}
