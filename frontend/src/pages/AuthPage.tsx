import React, { useState } from 'react';
import { api, setAuthHeader } from '../utils/api';
import { useAuth } from '../context/AuthContext';

export default function AuthPage() {
  const { login } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handle = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
      const payload = mode === 'login'
        ? { email: form.email, password: form.password }
        : { username: form.username, email: form.email, password: form.password };
      const { data } = await api.post(endpoint, payload);
      setAuthHeader(data.token);
      login(data.token, data.user);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--bg)',
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-lg)', padding: '40px', width: '100%', maxWidth: '420px',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, background: 'var(--accent)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, marginBottom: 12,
          }}>✏️</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>CollabEdit</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
            Real-time collaborative document editing
          </p>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', background: 'var(--bg)', borderRadius: 8,
          padding: 4, marginBottom: 24, gap: 4,
        }}>
          {(['login', 'register'] as const).map(m => (
            <button key={m} onClick={() => { setMode(m); setError(''); }}
              style={{
                flex: 1, padding: '7px', borderRadius: 6, fontSize: 13, fontWeight: 500,
                background: mode === m ? 'var(--surface)' : 'transparent',
                color: mode === m ? 'var(--text)' : 'var(--text-muted)',
                boxShadow: mode === m ? 'var(--shadow)' : 'none',
              }}>
              {m === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {mode === 'register' && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>
                Username
              </label>
              <input name="username" value={form.username} onChange={handle}
                placeholder="Your display name" required style={{ width: '100%' }} />
            </div>
          )}
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>
              Email
            </label>
            <input name="email" type="email" value={form.email} onChange={handle}
              placeholder="you@example.com" required style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>
              Password
            </label>
            <input name="password" type="password" value={form.password} onChange={handle}
              placeholder="••••••••" required minLength={6} style={{ width: '100%' }} />
          </div>

          {error && (
            <div style={{
              background: 'var(--danger-light)', color: 'var(--danger)',
              padding: '10px 12px', borderRadius: 6, fontSize: 13,
            }}>{error}</div>
          )}

          <button type="submit" className="btn-primary btn-lg" disabled={loading}
            style={{ width: '100%', marginTop: 4 }}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        {mode === 'register' && (
          <p style={{ marginTop: 16, fontSize: 12, color: 'var(--text-faint)', textAlign: 'center' }}>
            After registering, you'll get a unique <strong>CollabID</strong> — share it so others can invite you to documents.
          </p>
        )}
      </div>
    </div>
  );
}
