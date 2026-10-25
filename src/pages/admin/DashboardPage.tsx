import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/Button';
import { PlusIcon, EyeIcon } from '../../components/icons';
import { adminApi } from '../../lib/api';
import { formatStamp, formatSlot } from '../../../shared/time';
import { EMAIL_STATUS_LABEL } from '../../../shared/format';
import type { AdminSummary } from '../../../shared/contracts';

export function DashboardPage() {
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi
      .summary()
      .then(setSummary)
      .finally(() => setLoading(false));
  }, []);

  if (loading || !summary) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <div className="btn__spinner" style={{ width: 32, height: 32, color: 'var(--c-wine)', margin: '0 auto' }} />
      </div>
    );
  }

  return (
    <div>
      {/* Cabeçalho da página */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', color: 'var(--c-coffee)' }}>Visão Geral</h1>
          <p style={{ color: 'var(--c-taupe)', fontSize: '0.95rem' }}>
            Acompanhe o status e as respostas dos seus convites
          </p>
        </div>

        <Link to="/admin/invitations/new">
          <Button variant="primary">
            <PlusIcon style={{ width: 16, height: 16 }} />
            Criar Convite
          </Button>
        </Link>
      </div>

      {/* Cartões de resumo */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total de Convites</div>
          <div className="stat-value">{summary.total}</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Aguardando Resposta</div>
          <div className="stat-value stat-value--highlight">{summary.awaiting}</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Confirmados</div>
          <div className="stat-value" style={{ color: '#386b40' }}>{summary.confirmed}</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Encerrados / Rascunhos</div>
          <div className="stat-value" style={{ color: 'var(--c-taupe)' }}>
            {summary.closed + summary.drafts}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Tentativas no botão "Não"</div>
          <div className="stat-value" style={{ color: 'var(--c-rose)' }}>{summary.noAttempts}</div>
        </div>
      </div>

      {/* Notificações / Respostas Recentes */}
      <div className="admin-card">
        <div className="admin-card__header">
          <h2 className="admin-card__title">Últimas Confirmações Recebidas</h2>
          <Link to="/admin/invitations" style={{ fontSize: '0.9rem', color: 'var(--c-wine)', fontWeight: 500 }}>
            Ver todos os convites →
          </Link>
        </div>

        {summary.notifications.length === 0 ? (
          <p style={{ color: 'var(--c-taupe)', padding: '24px 0', textAlign: 'center', fontStyle: 'italic' }}>
            Nenhum convite foi respondido ainda. Quando alguém confirmar, os detalhes aparecerão aqui.
          </p>
        ) : (
          <table className="invites-table">
            <thead>
              <tr>
                <th>Pessoa</th>
                <th>Data Escolhida</th>
                <th>Momento da Confirmação</th>
                <th>E-mail</th>
                <th style={{ textAlign: 'right' }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {summary.notifications.map((n) => {
                const slotFmt = formatSlot(n.startsAt);
                return (
                  <tr key={n.invitationId}>
                    <td>
                      <strong>{n.name}</strong>
                      {!n.seen && <span className="badge badge--unseen">Novo</span>}
                    </td>
                    <td>
                      {slotFmt.dayMonth} às {slotFmt.time}
                    </td>
                    <td style={{ color: 'var(--c-taupe)', fontSize: '0.88rem' }}>
                      {formatStamp(n.confirmedAt)}
                    </td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          background: n.emailStatus === 'sent' ? '#eef5ee' : '#fcf1f2',
                          color: n.emailStatus === 'sent' ? '#386b40' : 'var(--c-wine)',
                        }}
                      >
                        {EMAIL_STATUS_LABEL[n.emailStatus]}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Link to={`/admin/invitations/${n.invitationId}`}>
                        <Button variant="ghost" size="small">
                          <EyeIcon style={{ width: 14, height: 14 }} />
                          Detalhes
                        </Button>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
