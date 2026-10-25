import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '../../components/Button';
import { RoseMark } from '../../components/icons';
import { adminApi, ApiError } from '../../lib/api';

export function RecoverPage() {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<[string, string] | null>(null);
  const [loadingQuestions, setLoadingQuestions] = useState(true);

  const [answer1, setAnswer1] = useState('');
  const [answer2, setAnswer2] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .recoveryQuestions()
      .then((data) => {
        setQuestions(data.questions);
      })
      .catch(() => {
        setError('Não foi possível carregar as perguntas de recuperação.');
      })
      .finally(() => {
        setLoadingQuestions(false);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('A nova senha e a confirmação não conferem.');
      return;
    }

    if (newPassword.length < 12) {
      setError('A nova senha deve ter no mínimo 12 caracteres.');
      return;
    }

    setLoading(true);

    try {
      await adminApi.recover(answer1, answer2, newPassword);
      // Redireciona para o login com mensagem
      navigate('/admin/login', {
        state: { notice: 'Senha redefinida com sucesso. Faça login com sua nova credencial.' },
      });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429 && err.retryAfterSeconds) {
          setError(`Muitas tentativas. Aguarde ${err.retryAfterSeconds} segundos.`);
        } else {
          setError(err.message || 'As respostas não conferem.');
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
      <div className="invite-card" style={{ maxWidth: 460, textAlign: 'left' }}>
        <div style={{ textAlign: 'center', width: '100%', marginBottom: 20 }}>
          <RoseMark style={{ width: 40, height: 40, color: 'var(--c-wine)', margin: '0 auto 8px' }} />
          <h1 className="invite-title" style={{ fontSize: '1.8rem' }}>Recuperação de Acesso</h1>
          <p style={{ color: 'var(--c-taupe)', fontSize: '0.9rem' }}>
            Responda às perguntas de segurança configuradas no servidor para definir uma nova senha
          </p>
        </div>

        {error && (
          <div className="admin-notice admin-notice--error" style={{ width: '100%' }} role="alert">
            {error}
          </div>
        )}

        {loadingQuestions ? (
          <p style={{ textAlign: 'center', color: 'var(--c-taupe)', padding: '24px 0' }}>
            Carregando perguntas…
          </p>
        ) : questions ? (
          <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="field">
              <label className="field__label" htmlFor="answer1">
                1. {questions[0]}
              </label>
              <input
                id="answer1"
                type="text"
                className="input"
                value={answer1}
                onChange={(e) => setAnswer1(e.target.value)}
                required
                autoComplete="off"
              />
            </div>

            <div className="field">
              <label className="field__label" htmlFor="answer2">
                2. {questions[1]}
              </label>
              <input
                id="answer2"
                type="text"
                className="input"
                value={answer2}
                onChange={(e) => setAnswer2(e.target.value)}
                required
                autoComplete="off"
              />
            </div>

            <div className="field">
              <label className="field__label" htmlFor="newPassword">
                Nova senha (mínimo 12 caracteres)
              </label>
              <input
                id="newPassword"
                type="password"
                className="input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={12}
                autoComplete="new-password"
              />
            </div>

            <div className="field">
              <label className="field__label" htmlFor="confirmPassword">
                Confirme a nova senha
              </label>
              <input
                id="confirmPassword"
                type="password"
                className="input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={12}
                autoComplete="new-password"
              />
            </div>

            <Button type="submit" variant="primary" block size="large" loading={loading}>
              Redefinir Senha
            </Button>

            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <Link to="/admin/login" style={{ fontSize: '0.85rem', color: 'var(--c-taupe)' }}>
                ← Voltar para o login
              </Link>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
