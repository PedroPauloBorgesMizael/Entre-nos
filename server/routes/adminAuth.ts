import { changePasswordSchema, loginSchema, recoverSchema } from '../../shared/contracts';
import {
  changePassword,
  clearSessionCookie,
  createSessionCookie,
  login,
  recoverPassword,
  requireAdmin,
} from '../auth';
import { json, readJson, validate } from '../http';
import type { RouteHandler } from '../types';

export const postLogin: RouteHandler = async ({ request, cfg, sql }) => {
  const { username, password } = validate(loginSchema, await readJson(request));
  const creds = await login(sql, cfg, username, password);
  return json({ ok: true }, { headers: { 'set-cookie': await createSessionCookie(cfg, creds.sessionVersion) } });
};

export const postLogout: RouteHandler = async ({ cfg }) =>
  json({ ok: true }, { headers: { 'set-cookie': clearSessionCookie(cfg) } });

export const getMe: RouteHandler = async ({ request, cfg, sql }) => {
  await requireAdmin(request, cfg, sql);
  return json({ username: cfg.adminUsername });
};

/** As perguntas não são segredo; só as respostas são. */
export const getRecoveryQuestions: RouteHandler = async ({ cfg }) => json({ questions: cfg.recoveryQuestions });

export const postRecover: RouteHandler = async ({ request, cfg, sql }) => {
  const { answer1, answer2, newPassword } = validate(recoverSchema, await readJson(request));
  await recoverPassword(sql, cfg, answer1, answer2, newPassword);
  // Todas as sessões antigas foram invalidadas; o administrador entra de novo com a nova senha.
  return json({ ok: true }, { headers: { 'set-cookie': clearSessionCookie(cfg) } });
};

export const postChangePassword: RouteHandler = async ({ request, cfg, sql }) => {
  await requireAdmin(request, cfg, sql);
  const { currentPassword, newPassword } = validate(changePasswordSchema, await readJson(request));
  const sv = await changePassword(sql, cfg, currentPassword, newPassword);
  return json({ ok: true }, { headers: { 'set-cookie': await createSessionCookie(cfg, sv) } });
};
