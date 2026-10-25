import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Button } from '../../components/Button';
import { TrashIcon, PlusIcon } from '../../components/icons';
import { adminApi, ApiError } from '../../lib/api';
import { utcToBrasiliaFields } from '../../../shared/time';
import type { SuggestionMode, InvitationInput } from '../../../shared/contracts';

interface SlotField {
  date: string;
  time: string;
}

export function InvitationFormPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);

  const [loadingInitial, setLoadingInitial] = useState(isEditing);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Campos do convite
  const [name, setName] = useState('');
  const [openingMessage, setOpeningMessage] = useState(
    'Separei um tempo especial para nós dois. Gostaria muito de ter a sua companhia.',
  );
  const [photoEnabled, setPhotoEnabled] = useState(false);
  const [selectedPhotoBlob, setSelectedPhotoBlob] = useState<Blob | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'draft' | 'active'>('active');
  const [question, setQuestion] = useState(
    'Tem algum lugar que você gostaria de conhecer ou alguma comida de que esteja com vontade?',
  );
  const [suggestionMode, setSuggestionMode] = useState<SuggestionMode>('place');
  const [options, setOptions] = useState<string[]>([]);
  const [newOptionInput, setNewOptionInput] = useState('');

  // Slots de data e horário
  const [slots, setSlots] = useState<SlotField[]>([
    {
      date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      time: '19:00',
    },
  ]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Se estiver editando, busca dados existentes
  useEffect(() => {
    if (!id) return;
    adminApi
      .get(id)
      .then((inv) => {
        setName(inv.name);
        setOpeningMessage(inv.openingMessage);
        setPhotoEnabled(inv.photoEnabled);
        setStatus(inv.status === 'draft' ? 'draft' : 'active');
        setQuestion(inv.question);
        setSuggestionMode(inv.suggestionMode);
        setOptions(inv.suggestionOptions);
        if (inv.hasPhoto) {
          setPhotoPreviewUrl(`/api/admin/invitations/${inv.id}/photo?v=${inv.photoVersion}`);
        }
        if (inv.slots.length > 0) {
          setSlots(
            inv.slots.map((s) => {
              const f = utcToBrasiliaFields(s.startsAt);
              return { date: f.date, time: f.time };
            }),
          );
        }
      })
      .catch((err) => {
        setError(err.message || 'Erro ao carregar dados do convite.');
      })
      .finally(() => {
        setLoadingInitial(false);
      });
  }, [id]);

  // Manipulação de imagem pessoal
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      alert('Formato de imagem inválido. Utilize JPEG, PNG ou WebP.');
      return;
    }

    if (file.size > 700 * 1024) {
      alert('A imagem deve ter no máximo 700 KB.');
      return;
    }

    setSelectedPhotoBlob(file);
    const objectUrl = URL.createObjectURL(file);
    setPhotoPreviewUrl(objectUrl);
    setPhotoEnabled(true);
  };

  // Gerenciamento de slots
  const handleAddSlot = () => {
    setSlots((prev) => [
      ...prev,
      {
        date: new Date(Date.now() + 8 * 86400000).toISOString().slice(0, 10),
        time: '19:00',
      },
    ]);
  };

  const handleRemoveSlot = (index: number) => {
    setSlots((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateSlot = (index: number, field: 'date' | 'time', value: string) => {
    setSlots((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    );
  };

  // Gerenciamento de opções predefinidas
  const handleAddOption = () => {
    const trimmed = newOptionInput.trim();
    if (!trimmed) return;
    if (options.length >= 12) {
      alert('Limite de 12 opções atingido.');
      return;
    }
    if (options.some((o) => o.toLowerCase() === trimmed.toLowerCase())) {
      alert('Esta opção já foi adicionada.');
      return;
    }
    setOptions((prev) => [...prev, trimmed]);
    setNewOptionInput('');
  };

  const handleRemoveOption = (opt: string) => {
    setOptions((prev) => prev.filter((o) => o !== opt));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (slots.length === 0) {
      setError('Adicione pelo menos uma data e horário disponíveis.');
      return;
    }

    const payload: InvitationInput = {
      name: name.trim(),
      openingMessage: openingMessage.trim(),
      photoEnabled,
      status,
      question: question.trim(),
      suggestionMode,
      suggestionOptions: options,
      slots,
    };

    setSubmitting(true);

    try {
      let savedId = id;
      if (isEditing && id) {
        await adminApi.update(id, payload);
      } else {
        const created = await adminApi.create(payload);
        savedId = created.id;
      }

      // Se uma nova foto foi selecionada, envia para a API
      if (selectedPhotoBlob && savedId) {
        await adminApi.putPhoto(savedId, selectedPhotoBlob);
      }

      navigate(`/admin/invitations/${savedId}`);
    } catch (err: any) {
      if (err instanceof ApiError && err.fieldErrors) {
        const first = Object.values(err.fieldErrors)[0];
        setError(first || err.message);
      } else {
        setError(err.message || 'Erro ao salvar o convite.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingInitial) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <div className="btn__spinner" style={{ width: 32, height: 32, color: 'var(--c-wine)', margin: '0 auto' }} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Link to="/admin/invitations" style={{ color: 'var(--c-wine)', textDecoration: 'none', fontSize: '0.9rem' }}>
          ← Voltar aos convites
        </Link>
      </div>

      <div className="admin-card">
        <h1 className="admin-card__title" style={{ marginBottom: 20 }}>
          {isEditing ? 'Editar Convite' : 'Criar Novo Convite'}
        </h1>

        {error && (
          <div className="admin-notice admin-notice--error" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="form-grid">
          {/* 1. Nome e Mensagem */}
          <div className="form-row form-row--2">
            <div className="field">
              <label className="field__label" htmlFor="inv-name">Nome da Pessoa *</label>
              <input
                id="inv-name"
                type="text"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Marina"
                required
                maxLength={80}
              />
              <span className="field__hint">Aparecerá no título e na carta de convite</span>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="inv-status">Status Inicial</label>
              <select
                id="inv-status"
                className="select"
                value={status}
                onChange={(e) => setStatus(e.target.value as 'draft' | 'active')}
              >
                <option value="active">Ativo (pronto para enviar)</option>
                <option value="draft">Rascunho (ainda indisponível)</option>
              </select>
            </div>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="inv-opening">Mensagem de Abertura *</label>
            <textarea
              id="inv-opening"
              className="textarea"
              rows={3}
              value={openingMessage}
              onChange={(e) => setOpeningMessage(e.target.value)}
              required
              maxLength={600}
            />
          </div>

          {/* 2. Fotografia Pessoal Opcional */}
          <div style={{ borderTop: '1px solid var(--c-line)', paddingTop: 16 }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: 8 }}>Fotografia Pessoal (Opcional)</h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--c-taupe)', marginBottom: 12 }}>
              Você pode incluir uma foto sua emoldurada na tela inicial do convite.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
              {photoPreviewUrl ? (
                <img
                  src={photoPreviewUrl}
                  alt="Prévia da foto pessoal"
                  style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--c-line)' }}
                />
              ) : (
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    background: 'var(--c-sand)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--c-taupe)',
                    fontSize: '0.75rem',
                  }}
                >
                  Sem foto
                </div>
              )}

              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: 'none' }}
                  onChange={handlePhotoSelect}
                />
                <Button
                  variant="ghost"
                  size="small"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ marginRight: 8 }}
                >
                  Escolher Imagem
                </Button>
                {photoPreviewUrl && (
                  <Button
                    variant="danger"
                    size="small"
                    onClick={() => {
                      setSelectedPhotoBlob(null);
                      setPhotoPreviewUrl(null);
                      setPhotoEnabled(false);
                    }}
                  >
                    Remover
                  </Button>
                )}
              </div>
            </div>

            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={photoEnabled}
                onChange={(e) => setPhotoEnabled(e.target.checked)}
                disabled={!photoPreviewUrl && !selectedPhotoBlob}
              />
              Exibir esta fotografia no convite público
            </label>
          </div>

          {/* 3. Datas e Horários Disponíveis */}
          <div style={{ borderTop: '1px solid var(--c-line)', paddingTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Opções de Datas e Horários *</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--c-taupe)' }}>
                  Cadastre combinações específicas de data e horário (horário de Brasília)
                </p>
              </div>

              <Button variant="ghost" size="small" onClick={handleAddSlot}>
                <PlusIcon style={{ width: 14, height: 14 }} />
                Adicionar Horário
              </Button>
            </div>

            <div className="slots-list-builder">
              {slots.map((s, index) => (
                <div key={index} className="slot-builder-item">
                  <div style={{ flex: 1, display: 'flex', gap: 10 }}>
                    <input
                      type="date"
                      className="input"
                      value={s.date}
                      onChange={(e) => handleUpdateSlot(index, 'date', e.target.value)}
                      required
                    />
                    <input
                      type="time"
                      className="input"
                      value={s.time}
                      onChange={(e) => handleUpdateSlot(index, 'time', e.target.value)}
                      required
                    />
                  </div>

                  <button
                    type="button"
                    className="btn btn--danger btn--small"
                    onClick={() => handleRemoveSlot(index)}
                    disabled={slots.length <= 1}
                    title="Remover este horário"
                  >
                    <TrashIcon style={{ width: 14, height: 14 }} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 4. Pergunta e Sugestões da Tela 3 */}
          <div style={{ borderTop: '1px solid var(--c-line)', paddingTop: 16 }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: 12 }}>Configuração da Pergunta (Tela 3)</h3>

            <div className="form-row form-row--2" style={{ marginBottom: 16 }}>
              <div className="field">
                <label className="field__label" htmlFor="inv-mode">Tipo de Resposta Esperada</label>
                <select
                  id="inv-mode"
                  className="select"
                  value={suggestionMode}
                  onChange={(e) => setSuggestionMode(e.target.value as SuggestionMode)}
                >
                  <option value="place">Local (restaurante, café, parque…)</option>
                  <option value="food">Comida (culinária japonesa, pizza, doces…)</option>
                  <option value="free">Sugestão Livre</option>
                </select>
              </div>

              <div className="field">
                <label className="field__label" htmlFor="inv-q">Texto da Pergunta *</label>
                <input
                  id="inv-q"
                  type="text"
                  className="input"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  required
                  maxLength={300}
                />
              </div>
            </div>

            <div className="field">
              <label className="field__label">Opções Predefinidas para Seleção (Opcional)</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input
                  type="text"
                  className="input"
                  placeholder="Ex.: Restaurante Italiano, Cinema, Café…"
                  value={newOptionInput}
                  onChange={(e) => setNewOptionInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddOption();
                    }
                  }}
                  maxLength={120}
                />
                <Button variant="ghost" size="small" onClick={handleAddOption}>
                  Adicionar
                </Button>
              </div>

              {options.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {options.map((opt) => (
                    <span
                      key={opt}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        background: 'var(--c-sand)',
                        padding: '4px 10px',
                        borderRadius: 14,
                        fontSize: '0.85rem',
                      }}
                    >
                      {opt}
                      <button
                        type="button"
                        onClick={() => handleRemoveOption(opt)}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--c-taupe)' }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 16 }}>
            <Link to="/admin/invitations">
              <Button variant="ghost">Cancelar</Button>
            </Link>
            <Button type="submit" variant="primary" size="large" loading={submitting}>
              {isEditing ? 'Salvar Alterações' : 'Gerar Convite Exclusivo 💌'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
