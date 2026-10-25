import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '../../components/Button';
import { CopyIcon, CheckIcon, PencilIcon, EyeIcon } from '../../components/icons';
import { adminApi } from '../../lib/api';
import { formatStamp, formatSlot } from '../../../shared/time';
import { suggestionLabel, suggestionValue, EMAIL_STATUS_LABEL, INVITATION_STATUS_LABEL } from '../../../shared/format';
import type { AdminInvitationDetail } from '../../../shared/contracts';

export function InvitationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<AdminInvitationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [resending, setResending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadData = () => {
    if (!id) return;
    setLoading(true);
    adminApi
      .get(id)
      .then((data) => {
        setDetail(data);
        if (data.response && !data.response.seen) {
          adminApi.markSeen(id).catch(() => {});
        }
      })
      .catch((err) => {
        setActionError(err.message || 'Erro ao carregar detalhes.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const handleCopy = async () => {
    if (!detail) return;
    try {
      await navigator.clipboard.writeText(detail.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleToggleStatus = async (newStatus: 'active' | 'closed') => {
    if (!detail) return;
    setActionError(null);
    try {
      if (newStatus === 'closed') await adminApi.close(detail.id);
      else await adminApi.activate(detail.id);
      loadData();
    } catch (err: any) {
      setActionError(err.message || 'Erro ao alterar status.');
    }
  };

  const handleReopen = async () => {
    if (!detail) return;
    const ok = window.confirm(
      'Tem certeza que deseja reabrir este convite? A resposta atual será arquivada e a pessoa poderá escolher uma nova data.',
    );
    if (!ok) return;

    setActionError(null);
    try {
      await adminApi.reopen(detail.id);
      loadData();
    } catch (err: any) {
      setActionError(err.message || 'Erro ao reabrir o convite.');
    }
  };

  const handleResendEmail = async () => {
    if (!detail) return;
    setResending(true);
    setActionError(null);
    try {
      const updated = await adminApi.resendEmail(detail.id);
      setDetail(updated);
    } catch (err: any) {
      setActionError(err.message || 'Erro ao reenviar e-mail de notificação.');
    } finally {
      setResending(false);
    }
  };

  if (loading || !detail) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <div className="btn__spinner" style={{ width: 32, height: 32, color: 'var(--c-wine)', margin: '0 auto' }} />
      </div>
    );
  }

  const { response } = detail;

  return (
    <div style={{ maxWidth: 840, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Link to="/admin/invitations" style={{ color: 'var(--c-wine)', textDecoration: 'none', fontSize: '0.9rem' }}>
          ← Voltar à lista de convites
        </Link>
      </div>

      {actionError && (
        <div className="admin-notice admin-notice--error" role="alert">
          {actionError}
        </div>
      )}

      {/* Banner com link exclusivo */}
      <div className="link-banner">
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--c-taupe)', marginBottom: 4, fontWeight: 500 }}>
            Link Exclusivo do Convite
          </div>
          <div className="link-input-display">{detail.link}</div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button variant="primary" size="small" onClick={handleCopy} data-testid="btn-copy-link">
            {copied ? (
              <>
                <CheckIcon style={{ width: 14, height: 14 }} />
                <span>Copiado!</span>
              </>
            ) : (
              <>
                <CopyIcon style={{ width: 14, height: 14 }} />
                <span>Copiar Link</span>
              </>
            )}
          </Button>

          <a href={detail.link} target="_blank" rel="noopener noreferrer">
            <Button variant="ghost" size="small">
              <EyeIcon style={{ width: 14, height: 14 }} />
              Testar
            </Button>
          </a>
        </div>
      </div>

      {/* Cartão de Resposta Confirmada (se houver) */}
      {response && (
        <div
          className="admin-card"
          style={{
            borderLeft: '4px solid var(--c-wine)',
            background: '#fffdfa',
          }}
        >
          <div className="admin-card__header">
            <div>
              <span className="badge badge--confirmed">Encontro Confirmado 💌</span>
              <h2 className="admin-card__title" style={{ marginTop: 8 }}>
                Resposta de {detail.name}
              </h2>
            </div>

            <div style={{ textAlign: 'right', fontSize: '0.88rem', color: 'var(--c-taupe)' }}>
              Confirmado em {formatStamp(response.confirmedAt)}
            </div>
          </div>

          {(() => {
            const slotFmt = formatSlot(response.startsAt);
            const label = suggestionLabel(response.suggestionType);
            const value = suggestionValue(response.selectedOption, response.suggestionText);

            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>
                <div className="stat-card" style={{ background: '#fcf8f4' }}>
                  <div className="stat-label">Data Escolhida</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--c-coffee)' }}>
                    {slotFmt.weekday}, {slotFmt.date}
                  </div>
                  <div style={{ fontSize: '1.25rem', fontFamily: 'var(--font-serif)', color: 'var(--c-wine)', marginTop: 4 }}>
                    às {slotFmt.time}
                  </div>
                </div>

                <div className="stat-card" style={{ background: '#fcf8f4' }}>
                  <div className="stat-label">{label} Escolhido</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 500, color: 'var(--c-coffee)' }}>
                    {value || 'Nenhuma preferência especificada'}
                  </div>
                </div>

                <div className="stat-card" style={{ background: '#fcf8f4' }}>
                  <div className="stat-label">Tentativas no botão "Não"</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 600, color: 'var(--c-rose)', fontFamily: 'var(--font-serif)' }}>
                    {detail.noAttempts}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Notificação por E-mail */}
          <div
            style={{
              padding: 14,
              borderRadius: 'var(--r-sm)',
              background: '#f9f5ef',
              border: '1px solid var(--c-line)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: '0.85rem', color: 'var(--c-taupe)', marginBottom: 2 }}>
                Status do E-mail Transacional
              </div>
              <div style={{ fontWeight: 500, fontSize: '0.95rem' }}>
                {EMAIL_STATUS_LABEL[response.emailStatus]}
                {response.emailSentAt && (
                  <span style={{ fontSize: '0.85rem', color: 'var(--c-taupe)', marginLeft: 8 }}>
                    ({formatStamp(response.emailSentAt)})
                  </span>
                )}
              </div>
              {response.emailError && (
                <div style={{ fontSize: '0.85rem', color: 'var(--c-danger)', marginTop: 4 }}>
                  {response.emailError}
                </div>
              )}
            </div>

            {response.emailStatus !== 'sent' && (
              <Button
                variant="ghost"
                size="small"
                loading={resending}
                onClick={handleResendEmail}
              >
                Reenviar Notificação
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Cartão de Detalhes da Configuração */}
      <div className="admin-card">
        <div className="admin-card__header">
          <div>
            <h2 className="admin-card__title">Configurações do Convite</h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
              <span className={`badge badge--${detail.status}`}>
                {INVITATION_STATUS_LABEL[detail.status]}
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--c-taupe)' }}>
                Criado em {formatStamp(detail.createdAt)}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Link to={`/admin/invitations/${detail.id}/edit`}>
              <Button variant="ghost" size="small">
                <PencilIcon style={{ width: 14, height: 14 }} />
                Editar
              </Button>
            </Link>

            {detail.status === 'confirmed' ? (
              <Button variant="ghost" size="small" onClick={handleReopen}>
                Reabrir Convite
              </Button>
            ) : detail.status === 'active' ? (
              <Button variant="ghost" size="small" onClick={() => handleToggleStatus('closed')}>
                Desativar Convite
              </Button>
            ) : (
              <Button variant="ghost" size="small" onClick={() => handleToggleStatus('active')}>
                Ativar Convite
              </Button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--c-taupe)' }}>Nome da Pessoa</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{detail.name}</div>
          </div>

          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--c-taupe)' }}>Mensagem de Abertura</div>
            <div style={{ whiteSpace: 'pre-line', color: 'var(--c-coffee)' }}>{detail.openingMessage}</div>
          </div>

          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--c-taupe)', marginBottom: 6 }}>
              Fotografia Pessoal
            </div>
            {detail.hasPhoto ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <img
                  src={`/api/admin/invitations/${detail.id}/photo?v=${detail.photoVersion}`}
                  alt="Foto do convite"
                  style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }}
                />
                <span style={{ fontSize: '0.9rem' }}>
                  {detail.photoEnabled ? '✓ Exibição ativada na página' : 'Exibição desativada'}
                </span>
              </div>
            ) : (
              <span style={{ fontSize: '0.9rem', color: 'var(--c-taupe)' }}>Nenhuma foto cadastrada</span>
            )}
          </div>

          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--c-taupe)', marginBottom: 6 }}>
              Horários Oferecidos ({detail.slots.length})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {detail.slots.map((s) => {
                const f = formatSlot(s.startsAt);
                return (
                  <span
                    key={s.id}
                    style={{
                      background: 'var(--c-champagne)',
                      border: '1px solid var(--c-line)',
                      padding: '6px 12px',
                      borderRadius: 'var(--r-sm)',
                      fontSize: '0.9rem',
                    }}
                  >
                    {f.weekday}, {f.dayMonth} às <strong>{f.time}</strong>
                  </span>
                );
              })}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--c-taupe)' }}>Pergunta da Terceira Tela</div>
            <div style={{ fontStyle: 'italic', color: 'var(--c-coffee)' }}>"{detail.question}"</div>
            {detail.suggestionOptions.length > 0 && (
              <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {detail.suggestionOptions.map((opt) => (
                  <span
                    key={opt}
                    style={{
                      background: 'var(--c-sand)',
                      padding: '3px 10px',
                      borderRadius: 12,
                      fontSize: '0.82rem',
                    }}
                  >
                    {opt}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
