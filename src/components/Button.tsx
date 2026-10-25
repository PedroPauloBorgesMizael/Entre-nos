import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger';
  size?: 'small' | 'normal' | 'large';
  loading?: boolean;
  block?: boolean;
  children: ReactNode;
}

/** Botão com estados de hover, foco, clique, carregamento e desabilitado, compatível com ref. */
export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', size = 'normal', loading = false, block = false, className = '', children, disabled, type = 'button', ...rest },
  ref,
) {
  const cls = [
    'btn',
    variant === 'ghost' && 'btn--ghost',
    variant === 'danger' && 'btn--danger',
    size === 'small' && 'btn--small',
    size === 'large' && 'btn--large',
    block && 'btn--block',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={cls}
      disabled={disabled || loading}
      data-loading={loading || undefined}
      aria-busy={loading || undefined}
    >
      {loading && <span className="btn__spinner" aria-hidden="true" />}
      {children}
    </button>
  );
});
