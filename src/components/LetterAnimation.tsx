import { useEffect, useState } from 'react';
import { HeartShape } from './icons';
import { useReducedMotion } from '../lib/useReducedMotion';

interface Props {
  onComplete: () => void;
}

type Stage =
  | 'start'        // 0. Preparação
  | 'heart-in'     // 1. Coração aparece no topo
  | 'heart-drop'   // 2. Coração desliza para a carta
  | 'letter-slide' // 3. Carta desliza para dentro do envelope
  | 'flap-close'   // 4. Aba do envelope fecha
  | 'wax-seal'     // 5. Selo de cera e brilhos
  | 'fly-away'     // 6. Envelope voa para o universo
  | 'done';        // 7. Concluído

export function LetterAnimation({ onComplete }: Props) {
  const [stage, setStage] = useState<Stage>('start');
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      // No modo de movimento reduzido, conclui quase imediatamente
      const t = setTimeout(() => {
        setStage('done');
        onComplete();
      }, 500);
      return () => clearTimeout(t);
    }

    const t1 = setTimeout(() => setStage('heart-in'), 200);
    const t2 = setTimeout(() => setStage('heart-drop'), 1000);
    const t3 = setTimeout(() => setStage('letter-slide'), 1700);
    const t4 = setTimeout(() => setStage('flap-close'), 2700);
    const t5 = setTimeout(() => setStage('wax-seal'), 3500);
    const t6 = setTimeout(() => setStage('fly-away'), 4400);
    const t7 = setTimeout(() => {
      setStage('done');
      onComplete();
    }, 5400);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
      clearTimeout(t6);
      clearTimeout(t7);
    };
  }, [onComplete, reducedMotion]);

  const heartClass = [
    'heart-float',
    (stage === 'heart-in' || stage === 'heart-drop') && 'show',
    stage === 'heart-drop' && 'drop-in',
    (stage === 'letter-slide' || stage === 'flap-close' || stage === 'wax-seal' || stage === 'fly-away' || stage === 'done') && 'drop-in',
  ].filter(Boolean).join(' ');

  const letterClass = [
    'letter-paper',
    (stage === 'letter-slide' || stage === 'flap-close' || stage === 'wax-seal' || stage === 'fly-away' || stage === 'done') && 'slide-in',
  ].filter(Boolean).join(' ');

  const flapClass = [
    'envelope__flap',
    (stage === 'flap-close' || stage === 'wax-seal' || stage === 'fly-away' || stage === 'done') && 'is-closed',
  ].filter(Boolean).join(' ');

  const sealClass = [
    'wax-seal',
    (stage === 'wax-seal' || stage === 'fly-away' || stage === 'done') && 'sealed',
  ].filter(Boolean).join(' ');

  const envelopeClass = [
    'envelope-wrapper',
    (stage === 'fly-away' || stage === 'done') && 'flying-away',
  ].filter(Boolean).join(' ');

  return (
    <div className="letter-stage" aria-live="polite" aria-label="Enviando nosso convite para o universo">
      {/* Coração flutuante */}
      <div className={heartClass}>
        <HeartShape style={{ width: 36, height: 36 }} />
      </div>

      {/* Envelope e carta */}
      <div className={envelopeClass}>
        {/* Folha da carta */}
        <div className={letterClass}>
          <div className="letter-paper__line letter-paper__line--short" />
          <div className="letter-paper__line letter-paper__line--medium" />
          <div className="letter-paper__line" />
          <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end', opacity: 0.6 }}>
            <HeartShape style={{ width: 14, height: 14, color: 'var(--c-rose)' }} />
          </div>
        </div>

        {/* Envelope estrutural */}
        <div className="envelope">
          {/* Aba dobrável */}
          <div className={flapClass} />
          {/* Bolso frontal */}
          <div className="envelope__pocket" />

          {/* Selo de cera */}
          <div className={sealClass}>
            <HeartShape style={{ width: 16, height: 16 }} />
          </div>

          {/* Brilhos estelares no selo */}
          {stage === 'wax-seal' && (
            <div className="sparkle-group" aria-hidden="true">
              <span className="sparkle" />
              <span className="sparkle" />
              <span className="sparkle" />
              <span className="sparkle" />
            </div>
          )}
        </div>
      </div>

      <div className="stellar-trail" aria-hidden="true" />

      <p style={{ marginTop: 32, fontSize: '0.95rem', color: 'var(--c-taupe)', fontStyle: 'italic', textAlign: 'center' }}>
        {stage === 'fly-away' || stage === 'done'
          ? 'Enviando ao universo…'
          : 'Guardando a nossa resposta com carinho…'}
      </p>
    </div>
  );
}
