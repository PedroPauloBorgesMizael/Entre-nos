import type {
  AdminInvitationDetail,
  AdminInvitationListItem,
  AdminSummary,
  ApiErrorBody,
  ConfirmInput,
  ConfirmResult,
  InvitationInput,
  PublicInvite,
} from '../../shared/contracts';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fieldErrors?: Record<string, string>,
    public retryAfterSeconds?: number,
  ) {
    super(message);
  }
  /** Falha de rede/servidor temporária: vale a pena tentar de novo. */
  get retryable(): boolean {
    return this.status === 0 || this.status >= 500 || this.status === 429;
  }
}

interface RequestOptions {
  body?: unknown;
  raw?: Blob;
  keepalive?: boolean;
  signal?: AbortSignal;
}

async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;
  if (opts.raw) {
    body = opts.raw;
    headers['content-type'] = opts.raw.type || 'application/octet-stream';
  } else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers['content-type'] = 'application/json';
  }
  if (method !== 'GET') headers['x-requested-with'] = 'entre-nos';

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body,
      credentials: 'same-origin',
      keepalive: opts.keepalive,
      signal: opts.signal,
    });
  } catch {
    throw new ApiError(0, 'network', 'Não foi possível conectar. Verifique sua internet e tente novamente.');
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const e = (data ?? {}) as Partial<ApiErrorBody>;
    throw new ApiError(
      res.status,
      e.error ?? 'unknown',
      e.message ?? 'Algo deu errado. Tente novamente em instantes.',
      e.fieldErrors,
      e.retryAfterSeconds,
    );
  }
  return data as T;
}

// ---------------------------------------------------------------------------
// Público
// ---------------------------------------------------------------------------

export const publicApi = {
  getInvite: (token: string) => request<PublicInvite>('GET', `/invite/${encodeURIComponent(token)}`),
  recordAttempt: (token: string, eventId: string) =>
    request<{ status: string }>('POST', `/invite/${encodeURIComponent(token)}/attempt`, {
      body: { eventId },
      keepalive: true,
    }),
  confirm: (token: string, input: ConfirmInput) =>
    request<ConfirmResult>('POST', `/invite/${encodeURIComponent(token)}/confirm`, { body: input }),
};

// ---------------------------------------------------------------------------
// Administrativo
// ---------------------------------------------------------------------------

export const adminApi = {
  me: () => request<{ username: string }>('GET', '/admin/me'),
  login: (username: string, password: string) => request<{ ok: true }>('POST', '/admin/login', { body: { username, password } }),
  logout: () => request<{ ok: true }>('POST', '/admin/logout'),
  recoveryQuestions: () => request<{ questions: [string, string] }>('GET', '/admin/recover/questions'),
  recover: (answer1: string, answer2: string, newPassword: string) =>
    request<{ ok: true }>('POST', '/admin/recover', { body: { answer1, answer2, newPassword } }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>('POST', '/admin/password', { body: { currentPassword, newPassword } }),
  summary: () => request<AdminSummary>('GET', '/admin/summary'),
  list: () => request<{ items: AdminInvitationListItem[] }>('GET', '/admin/invitations'),
  get: (id: string) => request<AdminInvitationDetail>('GET', `/admin/invitations/${id}`),
  create: (input: InvitationInput) => request<AdminInvitationDetail>('POST', '/admin/invitations', { body: input }),
  update: (id: string, input: InvitationInput) => request<AdminInvitationDetail>('PUT', `/admin/invitations/${id}`, { body: input }),
  close: (id: string) => request<AdminInvitationDetail>('POST', `/admin/invitations/${id}/close`),
  activate: (id: string) => request<AdminInvitationDetail>('POST', `/admin/invitations/${id}/activate`),
  reopen: (id: string) => request<AdminInvitationDetail>('POST', `/admin/invitations/${id}/reopen`),
  markSeen: (id: string) => request<{ ok: true }>('POST', `/admin/invitations/${id}/seen`),
  resendEmail: (id: string) => request<AdminInvitationDetail>('POST', `/admin/invitations/${id}/resend-email`),
  putPhoto: (id: string, blob: Blob) => request<AdminInvitationDetail>('PUT', `/admin/invitations/${id}/photo`, { raw: blob }),
  deletePhoto: (id: string) => request<AdminInvitationDetail>('DELETE', `/admin/invitations/${id}/photo`),
};
