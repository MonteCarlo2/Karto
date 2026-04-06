/**
 * Единые правила пароля для регистрации, сброса и API (должны совпадать с формами на /login и /reset-password).
 */
export function validatePasswordForAuth(password: string): { ok: true } | { ok: false; error: string } {
  if (!password || password.length < 8) {
    return { ok: false, error: "Пароль слишком короткий (минимум 8 символов)" };
  }
  if (password.length > 128) {
    return { ok: false, error: "Пароль не должен превышать 128 символов" };
  }
  if (/\s/.test(password)) {
    return { ok: false, error: "Пароль не должен содержать пробелы" };
  }
  if (!/^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]*$/.test(password)) {
    return { ok: false, error: "Пароль должен содержать только английские буквы, цифры и допустимые символы" };
  }
  if (!/[A-Z]/.test(password)) {
    return { ok: false, error: "Пароль должен содержать заглавную букву" };
  }
  if (!/[a-z]/.test(password)) {
    return { ok: false, error: "Пароль должен содержать строчную букву" };
  }
  if (!/\d/.test(password)) {
    return { ok: false, error: "Пароль должен содержать цифру" };
  }
  return { ok: true };
}

export const MAX_DISPLAY_NAME_LENGTH = 200;

export function validateDisplayName(name: string): { ok: true } | { ok: false; error: string } {
  const t = name.trim();
  if (t.length < 1) {
    return { ok: false, error: "Введите имя" };
  }
  if (t.length > MAX_DISPLAY_NAME_LENGTH) {
    return { ok: false, error: `Имя не длиннее ${MAX_DISPLAY_NAME_LENGTH} символов` };
  }
  return { ok: true };
}
