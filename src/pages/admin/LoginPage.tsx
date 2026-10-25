import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '../../components/Button';
import { RoseMark } from '../../components/icons';
import { adminApi, ApiError } from '../../lib/api';

export function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await adminApi.login(username, password);
      navigate('/admin');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429 && err.retryAfterSeconds) {
          setError(`Muitas tentativas. Aguarde ${err.retryAfterSeconds} segundos antes de tentar novamente.`);
        } else {
          setError(err.message || 'Credenciais inválidas.');
        }
      } else {
        setError('Falha ao conectar com o servidor.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="invite-page">
      <div className="invite-card" style={{ maxWidth: 400, textAlign: 'left' }}>
        <div style={{ textAlign: 'center', width: '100%', marginBottom: 20 }}>
          <RoseMark style={{ width: 40, height: 40, color: 'var(--c-wine)', margin: '0 auto 8px' }} />
          <h1 className="invite-title" style={{ fontSize: '1.8rem' }}>Painel Central</h1>
          <p style={{ color: 'var(--c-taupe)', fontSize: '0.9rem' }}>Acesso administrativo exclusivo</p>
        </div>

        {error && (
          <div className="admin-notice admin-notice--error" style={{ width: '100%' }} role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="field">
            <label className="field__label" htmlFor="username">Usuário</label>
            <input
              id="username"
              type="text"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              autoFocus
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          <Button type="submit" variant="primary" block size="large" loading={loading} data-testid="btn-login">
            Entrar no Painel
          </Button>

          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <Link to="/admin/recover" style={{ fontSize: '0.85rem', color: 'var(--c-taupe)' }}>
              Esqueceu a senha? Recuperar acesso
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
