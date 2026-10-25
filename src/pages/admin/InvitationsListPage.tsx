import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/Button';
import { PlusIcon, EyeIcon, CopyIcon, CheckIcon } from '../../components/icons';
import { adminApi } from '../../lib/api';
import { formatStamp } from '../../../shared/time';
import { INVITATION_STATUS_LABEL } from '../../../shared/format';
import type { AdminInvitationListItem } from '../../../shared/contracts';

export function InvitationsListPage() {
  const [items, setItems] = useState<AdminInvitationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadList = () => {
    setLoading(true);
    adminApi
      .list()
      .then((data) => setItems(data.items))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadList();
  }, []);

  const handleCopyLink = async (id: string, link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // fallback
    }
  };

  const handleToggleStatus = async (item: AdminInvitationListItem) => {
    try {
      if (item.status === 'active') {
        await adminApi.close(item.id);
      } else if (item.status === 'closed' || item.status === 'draft') {
        await adminApi.activate(item.id);
      }
      loadList();
    } catch (err: any) {
      alert(err.message || 'Erro ao alterar o status do convite.');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', color: 'var(--c-coffee)' }}>Convites Cadastrados</h1>
          <p style={{ color: 'var(--c-taupe)', fontSize: '0.95rem' }}>
            Gerencie links individuais, respostas e status de cada convite
          </p>
        </div>

        <Link to="/admin/invitations/new">
          <Button variant="primary">
            <PlusIcon style={{ width: 16, height: 16 }} />
            Novo Convite
          </Button>
        </Link>
      </div>

      <div className="admin-card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center' }}>
            <div className="btn__spinner" style={{ width: 32, height: 32, color: 'var(--c-wine)', margin: '0 auto' }} />
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <p style={{ color: 'var(--c-taupe)', marginBottom: 16 }}>Nenhum convite cadastrado ainda.</p>
            <Link to="/admin/invitations/new">
              <Button variant="primary" size="small">
                Criar seu primeiro convite
              </Button>
            </Link>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="invites-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Status</th>
                  <th>Criado em</th>
                  <th>Tentativas no "Não"</th>
                  <th>Resposta</th>
                  <th>Link do Convite</th>
                  <th style={{ textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link to={`/admin/invitations/${item.id}`} style={{ fontWeight: 600, color: 'var(--c-coffee)' }}>
                        {item.name}
                      </Link>
                      {item.unseenResponse && <span className="badge badge--unseen">Nova Resposta</span>}
                    </td>

                    <td>
                      <span className={`badge badge--${item.status}`}>
                        {INVITATION_STATUS_LABEL[item.status]}
                      </span>
                    </td>

                    <td style={{ color: 'var(--c-taupe)', fontSize: '0.88rem' }}>
                      {formatStamp(item.createdAt)}
                    </td>

                    <td style={{ textAlign: 'center' }}>
                      <span style={{ fontWeight: 600, color: item.noAttempts > 0 ? 'var(--c-rose)' : 'var(--c-taupe)' }}>
                        {item.noAttempts}
                      </span>
                    </td>

                    <td>
                      {item.hasResponse ? (
                        <span style={{ color: '#386b40', fontWeight: 500, fontSize: '0.9rem' }}>
                          ✓ Respondido
                        </span>
                      ) : (
                        <span style={{ color: 'var(--c-taupe)', fontSize: '0.85rem' }}>
                          Pendente
                        </span>
                      )}
                    </td>

                    <td>
                      <button
                        type="button"
                        className="btn btn--ghost btn--small"
                        onClick={() => handleCopyLink(item.id, item.link)}
                        title="Copiar link exclusivo do convite"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.82rem' }}
                      >
                        {copiedId === item.id ? (
                          <>
                            <CheckIcon style={{ width: 14, height: 14, color: 'var(--c-ok)' }} />
                            <span>Copiado!</span>
                          </>
                        ) : (
                          <>
                            <CopyIcon style={{ width: 14, height: 14 }} />
                            <span>Copiar Link</span>
                          </>
                        )}
                      </button>
                    </td>

                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <Link to={`/admin/invitations/${item.id}`}>
                          <Button variant="ghost" size="small">
                            <EyeIcon style={{ width: 14, height: 14 }} />
                            Ver
                          </Button>
                        </Link>

                        {item.status !== 'confirmed' && (
                          <button
                            type="button"
                            className={`btn btn--small ${item.status === 'active' ? 'btn--ghost' : 'btn--ghost'}`}
                            onClick={() => handleToggleStatus(item)}
                            title={item.status === 'active' ? 'Desativar convite' : 'Ativar convite'}
                          >
                            {item.status === 'active' ? 'Desativar' : 'Ativar'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
