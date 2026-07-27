"use client";

import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  PASSWORD_MIN,
  USERNAME_MAX,
  USERNAME_MIN,
  normalizeUsername,
  type AuthMode,
  type AuthField,
} from "@/components/modals/AuthModal";

export type AuthOutcome = "login" | "register" | "recover";

type Options = {
  // Вызывается после успешного входа/регистрации/восстановления — здесь место
  // для переноса гостевых данных, метрик и тостов. Выполняется ДО показа кода
  // восстановления, поэтому редиректить отсюда нельзя (иначе код не увидят).
  onAuthenticated?: (user: User, outcome: AuthOutcome) => Promise<void> | void;
  // Вызывается, когда флоу окончательно завершён: пользователь закрыл экран с
  // кодом восстановления (или вошёл, где кода нет). Сюда — редиректы.
  onFinished?: (outcome: AuthOutcome) => void;
};

const usernameToEmail = (username: string) => `${username}@smartcook.app`;

// Единая точка входа для всей авторизации (поиск, создание банкета, комната).
// Раньше эта логика была скопирована в этих трёх местах, причём с РАЗНЫМИ
// правилами: модалка разблокировала кнопку при логине >= 3 и пароле >= 8, а
// handleAuth на страницах банкетов требовал логин >= 4 и пароль >= 6 — часть
// комбинаций проходила валидацию кнопки и падала на submit. Теперь правила
// одни (USERNAME_MIN / PASSWORD_MIN) и живут ровно здесь.
// Регистрация идёт через /api/auth/register (сервис-роль: там выдаётся код
// восстановления), затем обычный signInWithPassword за сессией.
export function useAuthModal(options: Options = {}) {
  const { onAuthenticated, onFinished } = options;

  const [isOpen, setIsOpen] = useState(false);
  const [authMode, setAuthModeRaw] = useState<AuthMode>("register");
  const [authName, setAuthName] = useState("");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authRecoveryCode, setAuthRecoveryCode] = useState("");
  const [authTelegram, setAuthTelegram] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  // К какому полю относится серверная ошибка (напр. «логин занят» → username).
  // null — общая ошибка, показываем баннером. Поле показывает её красным под собой.
  const [authErrorField, setAuthErrorField] = useState<AuthField | null>(null);
  const [supportSent, setSupportSent] = useState(false);
  // Код восстановления показываем ровно один раз: в базе лежит только хеш.
  const [recoveryCodeToShow, setRecoveryCodeToShow] = useState<string | null>(null);
  const [lastOutcome, setLastOutcome] = useState<AuthOutcome>("login");

  const setAuthMode = (mode: AuthMode) => {
    setAuthModeRaw(mode);
    setSupportSent(false);
  };

  const open = (mode: AuthMode = "register") => {
    setAuthError(null);
    setAuthErrorField(null);
    setSupportSent(false);
    setRecoveryCodeToShow(null);
    setAuthModeRaw(mode);
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
    setAuthError(null);
    setAuthErrorField(null);
    setSupportSent(false);
    setAuthPassword("");
    setAuthRecoveryCode("");
  };

  const finish = (outcome: AuthOutcome) => {
    close();
    setRecoveryCodeToShow(null);
    onFinished?.(outcome);
  };

  const handleAuth = async () => {
    setAuthError(null);
    setAuthErrorField(null);
    const username = normalizeUsername(authUsername);
    const name = authName.trim();

    if (authMode === "register" && !name) {
      setAuthErrorField("name");
      setAuthError("Введите имя пользователя.");
      return;
    }
    if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
      setAuthErrorField("username");
      setAuthError(`Логин: латиница, цифры и «_», от ${USERNAME_MIN} до ${USERNAME_MAX} символов.`);
      return;
    }
    if (authPassword.length < PASSWORD_MIN) {
      setAuthErrorField("password");
      setAuthError(`Пароль слишком короткий — нужно минимум ${PASSWORD_MIN} символов.`);
      return;
    }

    setAuthLoading(true);
    try {
      if (authMode === "register") {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, username, password: authPassword }),
        });
        const payload = await res.json().catch(() => null);

        if (!res.ok || !payload?.ok) {
          // «Логин занят» (409) и прочие ошибки логина показываем у поля логина,
          // а не системным баннером — так человек сразу видит, что менять.
          if (res.status === 409) setAuthErrorField("username");
          setAuthError(payload?.error || "Не удалось создать аккаунт. Попробуйте ещё раз.");
          return;
        }

        const { data, error } = await supabase.auth.signInWithPassword({
          email: usernameToEmail(username),
          password: authPassword,
        });
        if (error || !data.user) {
          setAuthError("Аккаунт создан, но войти не удалось. Попробуйте войти вручную.");
          setAuthMode("login");
          return;
        }

        await onAuthenticated?.(data.user, "register");
        // Модалку не закрываем: сперва пользователь должен сохранить код.
        setLastOutcome("register");
        setRecoveryCodeToShow(payload.recoveryCode as string);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: usernameToEmail(username),
          password: authPassword,
        });
        if (error || !data.user) {
          setAuthError(
            error?.message.includes("Invalid login credentials")
              ? "Неверный логин или пароль."
              : "Не удалось войти. Попробуйте ещё раз.",
          );
          return;
        }

        await onAuthenticated?.(data.user, "login");
        finish("login");
      }
    } catch {
      setAuthError("Что-то пошло не так. Попробуйте позже.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRecover = async () => {
    setAuthError(null);
    setAuthErrorField(null);
    const username = normalizeUsername(authUsername);

    if (username.length < USERNAME_MIN || !authRecoveryCode.trim()) {
      setAuthError("Введите логин и код восстановления.");
      return;
    }
    if (authPassword.length < PASSWORD_MIN) {
      setAuthErrorField("password");
      setAuthError(`Пароль слишком короткий — нужно минимум ${PASSWORD_MIN} символов.`);
      return;
    }

    setAuthLoading(true);
    try {
      const res = await fetch("/api/auth/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, code: authRecoveryCode, newPassword: authPassword }),
      });
      const payload = await res.json().catch(() => null);

      if (!res.ok || !payload?.ok) {
        setAuthError(payload?.error || "Не удалось сменить пароль. Попробуйте позже.");
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: usernameToEmail(username),
        password: authPassword,
      });
      if (error || !data.user) {
        setAuthError("Пароль изменён. Войдите с новым паролем.");
        setAuthMode("login");
        return;
      }

      await onAuthenticated?.(data.user, "recover");
      setLastOutcome("recover");
      setRecoveryCodeToShow(payload.recoveryCode as string);
    } catch {
      setAuthError("Что-то пошло не так. Попробуйте позже.");
    } finally {
      setAuthLoading(false);
    }
  };

  // Запасной путь, когда потерян и пароль, и код: заявка админу. Пароль админ
  // не выдаёт — он присылает в Telegram новый КОД, и пользователь возвращается
  // сюда же (режим «forgot») задать пароль самостоятельно.
  const handleSupportRequest = async () => {
    const username = normalizeUsername(authUsername);
    const telegram = authTelegram.trim();

    if (username.length < USERNAME_MIN) {
      setAuthError("Сначала введите ваш логин.");
      return;
    }
    if (telegram.length < 2) {
      setAuthError("Укажите ваш Telegram — туда мы пришлём код восстановления.");
      return;
    }

    setAuthLoading(true);
    try {
      const res = await fetch("/api/auth/support-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, telegram }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.ok) {
        setAuthError(payload?.error || "Не удалось отправить заявку. Попробуйте позже.");
        return;
      }
      setAuthError(null);
      setSupportSent(true);
    } catch {
      setAuthError("Не удалось отправить заявку. Попробуйте позже.");
    } finally {
      setAuthLoading(false);
    }
  };

  const authModalProps = {
    isOpen,
    onClose: close,
    authMode,
    setAuthMode,
    authName,
    setAuthName,
    authUsername,
    setAuthUsername,
    authPassword,
    setAuthPassword,
    authRecoveryCode,
    setAuthRecoveryCode,
    authTelegram,
    setAuthTelegram,
    authLoading,
    authError,
    setAuthError,
    authErrorField,
    setAuthErrorField,
    handleAuth,
    handleRecover,
    handleSupportRequest,
    supportSent,
    recoveryCodeToShow,
    onRecoveryAcknowledged: () => finish(lastOutcome),
  };

  return { isOpen, open, close, setIsOpen, authError, setAuthError, authModalProps };
}
