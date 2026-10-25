import { Routes, Route, Link } from 'react-router-dom';
import { InvitePage } from './pages/public/InvitePage';
import { LoginPage } from './pages/admin/LoginPage';
import { RecoverPage } from './pages/admin/RecoverPage';
import { AdminLayout } from './pages/admin/AdminLayout';
import { DashboardPage } from './pages/admin/DashboardPage';
import { InvitationsListPage } from './pages/admin/InvitationsListPage';
import { InvitationFormPage } from './pages/admin/InvitationFormPage';
import { InvitationDetailPage } from './pages/admin/InvitationDetailPage';
import { RoseMark } from './components/icons';
import { Button } from './components/Button';

function LandingPage() {
  return (
    <main className="invite-page">
      <div className="invite-card">
        <RoseMark style={{ width: 56, height: 56, color: 'var(--c-rose)', marginBottom: 20 }} />
        <h1 className="invite-title" style={{ fontSize: '2.4rem' }}>Entre Nós</h1>
        <p className="invite-message" style={{ margin: '16px 0 28px' }}>
          Um espaço delicado, elegante e memorável para convites especiais. Cada convite possui um link exclusivo gerado no painel administrativo.
        </p>

        <Link to="/admin">
          <Button variant="primary" size="large">
            Acessar Painel Administrativo
          </Button>
        </Link>
      </div>
    </main>
  );
}

function NotFoundPage() {
  return (
    <main className="invite-page">
      <div className="invite-card">
        <RoseMark style={{ width: 44, height: 44, color: 'var(--c-blush)', marginBottom: 16 }} />
        <h1 className="invite-title" style={{ fontSize: '2rem' }}>Página Não Encontrada</h1>
        <p className="invite-message" style={{ margin: '12px 0 24px' }}>
          O endereço informado não existe ou o convite não está mais disponível.
        </p>
        <Link to="/">
          <Button variant="ghost">Voltar ao início</Button>
        </Link>
      </div>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/c/:token" element={<InvitePage />} />

      {/* Rotas administrativas desprotegidas */}
      <Route path="/admin/login" element={<LoginPage />} />
      <Route path="/admin/recover" element={<RecoverPage />} />

      {/* Rotas administrativas protegidas com layout */}
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="invitations" element={<InvitationsListPage />} />
        <Route path="invitations/new" element={<InvitationFormPage />} />
        <Route path="invitations/:id" element={<InvitationDetailPage />} />
        <Route path="invitations/:id/edit" element={<InvitationFormPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
