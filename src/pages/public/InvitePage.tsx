import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Petals } from '../../components/Petals';
import { LetterAnimation } from '../../components/LetterAnimation';
import { RoseMark, CheckIcon } from '../../components/icons';
import { publicApi, ApiError } from '../../lib/api';
import { AttemptReporter } from '../../lib/attemptReporter';
import { pickPosition, type Point, type Rect } from '../../lib/noButton';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { formatSlot } from '../../../shared/time';
import { suggestionLabel, suggestionValue } from '../../../shared/format';
import type { PublicInvite, PublicSlot, PublicAnswer } from '../../../shared/contracts';

export function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const reducedMotion = useReducedMotion();

  // Estados principais
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<PublicInvite | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);

  // Telas do fluxo: 1: Pergunta inicial, 2: Horário, 3: Sugestão, 4: Animação carta, 5: Sucesso final
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Chuva de pétalas
  const [petalBurst, setPetalBurst] = useState(0);

  // Tela 1: Botão Não fugitivo
  const [noPos, setNoPos] = useState<Point | null>(null);
  const reporterRef = useRef<AttemptReporter | null>(null);
  const yesBtnRef = useRef<HTMLButtonElement | null>(null);
  const noBtnRef = useRef<HTMLButtonElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const lastInteractionTimeRef = useRef(0);

  // Tela 2: Seleção de horário
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);

  // Tela 3: Sugestão e confirmação
  const [selectedChip, setSelectedChip] = useState<string | null>(null);
  const [suggestionText, setSuggestionText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [finalAnswer, setFinalAnswer] = useState<PublicAnswer | null>(null);

  // Inicializa o reporter e busca o convite
  useEffect(() => {
    if (!token) {
      setErrorStatus(404);
      setLoading(false);
      return;
    }

    const rep = new AttemptReporter({
      token,
      send: (eventId) => publicApi.recordAttempt(token, eventId),
      storage: typeof window !== 'undefined' ? window.sessionStorage : null,
    });
    reporterRef.current = rep;

    publicApi
      .getInvite(token)
      .then((data) => {
        setInvite(data);
        if (data.state === 'answered' && data.answer) {
          setFinalAnswer(data.answer);
          setStep(5);
        }
      })
      .catch((err) => {
        if (err instanceof ApiError) {
          setErrorStatus(err.status);
        } else {
          setErrorStatus(500);
        }
      })
      .finally(() => {
        setLoading(false);
      });

    return () => {
      rep.dispose();
    };
  }, [token]);

  // Transição para tela 2 com chuva de pétalas
  const handleYes = () => {
    setPetalBurst((prev) => prev + 1);
    setStep(2);
  };

  // Comportamento especial do botão Não: move para posição aleatória válida na tela e registra
  const handleNoInteraction = useCallback(
    (e: React.UIEvent) => {
      e.preventDefault();
      // Previne duplo disparo em telas sensíveis ao toque (pointerdown + click)
      const now = Date.now();
      if (now - lastInteractionTimeRef.current < 250) return;
      lastInteractionTimeRef.current = now;

      // 1. Registra tentativa de forma confiável e idempotente
      reporterRef.current?.record();

      // 2. Calcula nova posição dentro dos limites da janela evitando elementos vitais
      const btnEl = noBtnRef.current;
      const yesEl = yesBtnRef.current;
      const cardEl = cardRef.current;

      const vp = {
        w: window.visualViewport?.width ?? window.innerWidth,
        h: window.visualViewport?.height ?? window.innerHeight,
      };

      const btnRect = btnEl
        ? { w: btnEl.offsetWidth || 110, h: btnEl.offsetHeight || 44 }
        : { w: 110, h: 44 };

      const avoid: Rect[] = [];
      if (yesEl) {
        const yb = yesEl.getBoundingClientRect();
        avoid.push({ x: yb.left, y: yb.top, w: yb.width, h: yb.height });
      }
      if (cardEl) {
        const cb = cardEl.getBoundingClientRect();
        avoid.push({ x: cb.left, y: cb.top, w: cb.width, h: cb.height });
      }

      const newPoint = pickPosition({
        viewport: vp,
        button: btnRect,
        avoid,
        previous: noPos,
        margin: 16,
        padding: 12,
      });

      setNoPos(newPoint);
    },
    [noPos],
  );

  // Confirmação final do encontro
  const handleConfirm = async () => {
    if (!token || !selectedSlotId || !invite) return;

    const opt = selectedChip || null;
    const txt = suggestionText.trim() || null;

    if (!opt && !txt) {
      setSubmitError(
        invite.suggestionOptions.length > 0
          ? 'Escolha uma opção ou escreva uma ideia.'
          : 'Conte sua ideia para o encontro.',
      );
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await publicApi.confirm(token, {
        slotId: selectedSlotId,
        selectedOption: opt,
        suggestionText: txt,
      });

      setFinalAnswer(res.answer);
      // Persistência confirmada com sucesso: agora inicia a animação da carta
      setStep(4);
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmitError(err.message);
      } else {
        setSubmitError('Não foi possível enviar a resposta. Verifique a conexão e tente novamente.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Carregando
  if (loading) {
    return (
      <main className="invite-page">
        <div className="invite-card">
          <div className="btn__spinner" style={{ width: 28, height: 28, color: 'var(--c-wine)', margin: '40px 0' }} />
          <p style={{ color: 'var(--c-taupe)' }}>Abrindo convite…</p>
        </div>
      </main>
    );
  }

  // Convite inexistente ou indisponível
  if (errorStatus || !invite) {
    return (
      <main className="invite-page">
        <div className="invite-card">
          <RoseMark style={{ width: 48, height: 48, color: 'var(--c-blush)', marginBottom: 20 }} />
          <h1 className="invite-title" style={{ fontSize: '1.8rem' }}>Convite indisponível</h1>
          <p className="invite-message" style={{ margin: '12px 0 24px' }}>
            Este convite não está mais ativo ou o link informado não foi encontrado.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="invite-page">
      {/* Chuva de pétalas ativada ao clicar em "Sim" */}
      <Petals burst={petalBurst} reducedMotion={reducedMotion} />

      <div className="invite-card" ref={cardRef}>
        {/* Passos visuais para telas 2 e 3 */}
        {(step === 2 || step === 3) && (
          <div className="steps-indicator" aria-label={`Passo ${step - 1} de 2`}>
            <span className={`step-dot ${step === 2 ? 'is-active' : 'is-completed'}`} />
            <span className={`step-dot ${step === 3 ? 'is-active' : ''}`} />
          </div>
        )}

        {/* ========================================================
            TELA 1: "GOSTARIA DE SAIR COMIGO?"
            ======================================================== */}
        {step === 1 && (
          <>
            {invite.photoUrl && (
              <div className="invite-photo-frame">
                <img
                  src={invite.photoUrl}
                  alt={`Foto pessoal de quem fez o convite para ${invite.name}`}
                  className="invite-photo"
                />
              </div>
            )}

            <span className="invite-header-badge">Para {invite.name}</span>
            <h1 className="invite-title">Gostaria de sair comigo?</h1>

            <p className="invite-message">{invite.openingMessage}</p>

            <div className="invite-actions-wrap">
              <Button
                ref={yesBtnRef}
                variant="primary"
                size="large"
                className="btn-yes"
                onClick={handleYes}
                data-testid="btn-yes"
              >
                Sim ♡
              </Button>

              <button
                ref={noBtnRef}
                type="button"
                className={`btn btn--ghost btn--large btn-no ${noPos ? 'btn-no--evading' : ''}`}
                style={
                  noPos
                    ? {
                        top: `${noPos.y}px`,
                        left: `${noPos.x}px`,
                      }
                    : undefined
                }
                onClick={handleNoInteraction}
                onPointerDown={handleNoInteraction}
                data-testid="btn-no"
                aria-label="Não"
              >
                Não
              </button>
            </div>
          </>
        )}

        {/* ========================================================
            TELA 2: ESCOLHA DA DATA E DO HORÁRIO
            ======================================================== */}
        {step === 2 && (
          <>
            <span className="invite-header-badge">Datas & Horários</span>
            <h1 className="invite-title">Que dia combina com você?</h1>
            <p className="invite-message" style={{ marginBottom: 24 }}>
              Separei alguns dias e horários em que posso sair. Escolha a opção que funciona melhor para você.
            </p>

            {invite.slots.length === 0 ? (
              <div style={{ padding: '24px 0', color: 'var(--c-taupe)' }}>
                <p>No momento não há horários disponíveis cadastrados para este convite.</p>
              </div>
            ) : (
              <div className="slots-grid" role="radiogroup" aria-label="Datas e horários disponíveis">
                {invite.slots.map((slot: PublicSlot) => {
                  const label = formatSlot(slot.startsAt);
                  const isSelected = selectedSlotId === slot.id;

                  return (
                    <button
                      key={slot.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      className={`slot-card ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => setSelectedSlotId(slot.id)}
                    >
                      <div className="slot-card__info">
                        <span className="slot-card__weekday">{label.weekday}</span>
                        <span className="slot-card__date">{label.dayMonth}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span className="slot-card__time">{label.time}</span>
                        <div className="slot-radio-indicator">
                          {isSelected && <span className="slot-radio-indicator__dot" />}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div style={{ width: '100%', display: 'flex', gap: 12 }}>
              <Button variant="ghost" onClick={() => setStep(1)} style={{ flex: '0 0 auto' }}>
                ← Voltar
              </Button>
              <Button
                variant="primary"
                block
                disabled={!selectedSlotId}
                onClick={() => setStep(3)}
                data-testid="btn-choose-slot"
              >
                Escolher este momento →
              </Button>
            </div>
          </>
        )}

        {/* ========================================================
            TELA 3: SUGESTÃO DO QUE FAZER
            ======================================================== */}
        {step === 3 && (
          <>
            <span className="invite-header-badge">Detalhes do Encontro</span>
            <h1 className="invite-title">E o que você gostaria de fazer?</h1>
            <p className="invite-message" style={{ marginBottom: 20 }}>
              Agora falta escolher uma ideia para o nosso encontro.
            </p>

            <div style={{ width: '100%', textAlign: 'left', marginBottom: 20 }}>
              <label className="field__label" htmlFor="suggestion-input" style={{ display: 'block', marginBottom: 10 }}>
                {invite.question}
              </label>

              {/* Opções predefinidas configuradas no painel */}
              {invite.suggestionOptions.length > 0 && (
                <div className="options-chips">
                  {invite.suggestionOptions.map((opt) => {
                    const isSelected = selectedChip === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        className={`option-chip ${isSelected ? 'is-selected' : ''}`}
                        onClick={() => setSelectedChip(isSelected ? null : opt)}
                      >
                        {isSelected && <CheckIcon style={{ width: 14, height: 14, marginRight: 4, display: 'inline' }} />}
                        {opt}
                      </button>
                    );
                  })}
                </div>
              )}

              <textarea
                id="suggestion-input"
                className="textarea"
                rows={3}
                placeholder={
                  invite.suggestionMode === 'place'
                    ? 'Algum restaurante, café, parque ou lugar favorito…'
                    : invite.suggestionMode === 'food'
                    ? 'Massa, culinária japonesa, hambúrguer artesanal, doces…'
                    : 'Escreva sua ideia ou sugestão…'
                }
                value={suggestionText}
                onChange={(e) => setSuggestionText(e.target.value)}
                maxLength={300}
              />
            </div>

            {submitError && (
              <p className="field__error" style={{ marginBottom: 16 }} role="alert">
                {submitError}
              </p>
            )}

            <div style={{ width: '100%', display: 'flex', gap: 12 }}>
              <Button
                variant="ghost"
                disabled={isSubmitting}
                onClick={() => setStep(2)}
                style={{ flex: '0 0 auto' }}
              >
                ← Voltar
              </Button>

              <Button
                variant="primary"
                block
                size="large"
                loading={isSubmitting}
                onClick={handleConfirm}
                data-testid="btn-confirm-date"
              >
                Mandar nosso date para o universo 💌
              </Button>
            </div>
          </>
        )}

        {/* ========================================================
            TELA 4: ANIMAÇÃO DA CARTA E DO CORAÇÃO
            ======================================================== */}
        {step === 4 && (
          <LetterAnimation onComplete={() => setStep(5)} />
        )}

        {/* ========================================================
            TELA 5 / ESTADO CONCLUÍDO: RESUMO DO DATE
            ======================================================== */}
        {step === 5 && finalAnswer && (
          <>
            <RoseMark style={{ width: 44, height: 44, color: 'var(--c-rose)', marginBottom: 16 }} />
            <h1 className="invite-title" style={{ fontSize: '2rem' }}>
              Nosso encontro foi para o universo 💌
            </h1>

            <p className="invite-message" style={{ marginBottom: 20 }}>
              Agora é só preparar esse momento especial.
            </p>

            {/* Resumo discreto da escolha feita */}
            {(() => {
              const slotDetails = formatSlot(finalAnswer.startsAt);
              const label = suggestionLabel(finalAnswer.suggestionType);
              const value = suggestionValue(finalAnswer.selectedOption, finalAnswer.suggestionText);

              return (
                <div className="summary-box" data-testid="summary-box">
                  <div className="summary-row">
                    <span className="summary-label">Data</span>
                    <span className="summary-val">{slotDetails.weekday}, {slotDetails.date}</span>
                  </div>
                  <div className="summary-row">
                    <span className="summary-label">Horário</span>
                    <span className="summary-val">{slotDetails.time}</span>
                  </div>
                  {value && (
                    <div className="summary-row">
                      <span className="summary-label">{label}</span>
                      <span className="summary-val">{value}</span>
                    </div>
                  )}
                </div>
              );
            })()}

            <p style={{ fontSize: '0.88rem', color: 'var(--c-taupe)', fontStyle: 'italic' }}>
              Entre Nós ♡
            </p>
          </>
        )}
      </div>
    </main>
  );
}
