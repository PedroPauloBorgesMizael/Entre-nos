import { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate, Link } from 'react-router-dom';
import { RoseMark, PlusIcon } from '../../components/icons';
import { Button } from '../../components/Button';
import { adminApi } from '../../lib/api';

export function AdminLayout() {
  const navigate = useNavigate();
  const [adminUser, setAdminUser] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  // Modal de alteração de senha
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [curPassword, setCurPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    adminApi
      .me()
      .then((data) => {
        setAdminUser(data.username);
      })
      .catch(() => {
        navigate('/admin/login', { replace: true });
      })
      .finally(() => {
        setChecking(false);
      });
  }, [navigate]);

  const handleLogout = async () => {
    try {
      await adminApi.logout();
    } catch {
      // continua mesmo com erro
    }
    navigate('/admin/login', { replace: true });
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg(null);
    if (newPassword.length < 12) {
      setPwdMsg({ text: 'A nova senha deve ter no mínimo 12 caracteres.', error: true });
      return;
    }
    setPwdLoading(true);
    try {
      await adminApi.changePassword(curPassword, newPassword);
      setPwdMsg({ text: 'Senha alterada com sucesso!', error: false });
      setCurPassword('');
      setNewPassword('');
      setTimeout(() => setShowPasswordModal(false), 1500);
    } catch (err: any) {
      setPwdMsg({ text: err.message || 'Erro ao alterar a senha.', error: true });
    } finally {
      setPwdLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="invite-page">
        <div className="btn__spinner" style={{ width: 32, height: 32, color: 'var(--c-wine)' }} />
      </div>
    );
  }

  return (
    <div className="admin-layout">
      <header className="admin-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <Link to="/admin" className="admin-brand">
            <RoseMark style={{ width: 22, height: 22, color: 'var(--c-wine)' }} />
            <span>Entre Nós</span>
          </Link>

          <nav className="admin-nav">
            <NavLink
              to="/admin"
              end
              className={({ isActive }) => `admin-nav-link ${isActive ? 'is-active' : ''}`}
            >
              Visão Geral
            </NavLink>
            <NavLink
              to="/admin/invitations"
              end
              className={({ isActive }) => `admin-nav-link ${isActive ? 'is-active' : ''}`}
            >
              Convites
            </NavLink>
          </nav>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/admin/invitations/new">
            <Button variant="primary" size="small" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <PlusIcon style={{ width: 14, height: 14 }} />
              Novo Convite
            </Button>
          </Link>

          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => setShowPasswordModal(true)}
            title="Alterar credencial"
          >
            Alterar Senha
          </button>

          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={handleLogout}
          >
            Sair ({adminUser})
          </button>
        </div>
      </header>

      <main className="admin-container">
        <Outlet />
      </main>

      {/* Modal de troca de senha */}
      {showPasswordModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(59, 48, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 100,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowPasswordModal(false);
          }}
        >
          <div className="admin-card" style={{ maxWidth: 420, width: '100%', margin: 0 }}>
            <div className="admin-card__header">
              <h2 className="admin-card__title" style={{ fontSize: '1.2rem' }}>Alterar Senha Administrativa</h2>
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}
              >
                ✕
              </button>
            </div>

            {pwdMsg && (
              <div className={`admin-notice ${pwdMsg.error ? 'admin-notice--error' : 'admin-notice--success'}`}>
                {pwdMsg.text}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="form-grid">
              <div className="field">
                <label className="field__label" htmlFor="cur-pwd">Senha Atual</label>
                <input
                  id="cur-pwd"
                  type="password"
                  className="input"
                  value={curPassword}
                  onChange={(e) => setCurPassword(e.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label className="field__label" htmlFor="new-pwd">Nova Senha (mínimo 12 caracteres)</label>
                <input
                  id="new-pwd"
                  type="password"
                  className="input"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={12}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <Button variant="ghost" size="small" onClick={() => setShowPasswordModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" size="small" loading={pwdLoading}>
                  Salvar Nova Senha
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
