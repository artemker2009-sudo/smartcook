"use client";

// Личный кабинет — настоящий роут /profile. Собирает в одном месте то, что уже
// есть в приложении: профиль вкуса (аллергии/нелюбимые), историю рецептов,
// избранное, свои посты в ленте со статусами модерации, имя/дату регистрации и
// выход. Ничего не дублирует в БД: данные берутся из тех же источников, что и
// раньше (recipes по session_id, community_posts по RLS «свои», user_metadata,
// localStorage для гостевого профиля вкуса). Модалки (PreferencesModal,
// EditProfileModal, CropperModal, AuthModal) — общие с остальным приложением.

import { useState, useEffect, useCallback, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import type { Area } from "react-easy-crop";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import {
  User as UserIcon,
  Edit3,
  LogOut,
  Settings,
  ChevronRight,
  Heart,
  Clock,
  Flame,
  History,
  ChefHat,
  HeartCrack,
  CheckCircle2,
  XCircle,
  Trash2,
  ImageIcon,
  Code2,
  AlertTriangle,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import { reachGoal } from "@/lib/metrika";
import { claimGuestPartiesToAccount } from "@/lib/claimParties";
import { decodeHeicIfNeeded, reportPhotoError } from "@/lib/photo";
import {
  DEVELOPER_ID,
  getCroppedImg,
  formatCookingTime,
  formatTime,
  formatCalories,
} from "@/lib/utils";
import type { DBRecipe } from "@/lib/types";

import Button from "@/components/ui/Button";
import { useAuthModal } from "@/components/modals/useAuthModal";
import AuthModal from "@/components/modals/AuthModal";
import PreferencesModal from "@/components/modals/PreferencesModal";
import EditProfileModal from "@/components/modals/EditProfileModal";
import CropperModal from "@/components/modals/CropperModal";
import DeleteAccountModal from "@/components/modals/DeleteAccountModal";

type MyPost = {
  id: string;
  created_at: string;
  recipe_title: string | null;
  photo_url: string;
  caption: string | null;
  status: "pending" | "approved" | "rejected";
};

// Месяцы в родительном падеже: «В приложении с июля 2026».
const MONTHS_GENITIVE = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

function formatJoined(createdAt?: string): string | null {
  if (!createdAt) return null;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return null;
  return `В приложении с ${MONTHS_GENITIVE[d.getMonth()]} ${d.getFullYear()}`;
}

export default function ProfileApp() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [feed, setFeed] = useState<DBRecipe[]>([]);
  const [myPosts, setMyPosts] = useState<MyPost[]>([]);
  const [tab, setTab] = useState<"history" | "favorites">("history");

  // Профиль вкуса.
  const [allergies, setAllergies] = useState<string[]>([]);
  const [dislikes, setDislikes] = useState<string[]>([]);
  const [newAllergy, setNewAllergy] = useState("");
  const [newDislike, setNewDislike] = useState("");
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);

  // Редактирование профиля (имя/username/аватар) + кроппер аватара.
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editProfileName, setEditProfileName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editAvatarPreview, setEditAvatarPreview] = useState<string | null>(null);
  const [editAvatarFile, setEditAvatarFile] = useState<File | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isCropping, setIsCropping] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);

  // Удаление аккаунта (App Store 5.1.1(v)).
  const [isDeleteAccountOpen, setIsDeleteAccountOpen] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  // Цель Метрики: профиль открыт (одна на каждый вход, независимо от точки входа).
  useEffect(() => {
    reachGoal("profile_open");
  }, []);

  // Профиль вкуса гостя — из localStorage (перезапишется метаданными аккаунта).
  useEffect(() => {
    try {
      const a = JSON.parse(localStorage.getItem("sc_allergies") || "[]");
      const d = JSON.parse(localStorage.getItem("sc_dislikes") || "[]");
      if (Array.isArray(a) && a.length) setAllergies(a);
      if (Array.isArray(d) && d.length) setDislikes(d);
    } catch {}
  }, []);

  // Сессия + подписка на изменения (вход/выход/восстановление).
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthChecked(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const fetchMyRecipes = useCallback(async (sessionId: string) => {
    const { data, error } = await supabase
      .from("recipes")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false });
    if (!error && data) setFeed(data as DBRecipe[]);
  }, []);

  // Свои посты (в т.ч. на модерации/отклонённые) — RLS отдаёт только владельцу.
  const loadMine = useCallback(async () => {
    const { data, error } = await supabase
      .from("community_posts")
      .select("id,created_at,recipe_title,photo_url,caption,status")
      .order("created_at", { ascending: false })
      .limit(30);
    if (!error && data) setMyPosts(data as MyPost[]);
  }, []);

  // Когда пользователь известен — подтягиваем его данные и наполняем форму правки.
  useEffect(() => {
    if (!user) {
      setFeed([]);
      setMyPosts([]);
      return;
    }
    setEditProfileName(user.user_metadata?.full_name || "");
    setEditUsername(user.user_metadata?.username || user.email?.split("@")[0] || "");
    setEditAvatarPreview(user.user_metadata?.avatar_url || null);
    if (user.user_metadata) {
      setAllergies(user.user_metadata.allergies || []);
      setDislikes(user.user_metadata.dislikes || []);
    }
    fetchMyRecipes(user.id);
    loadMine();
  }, [user, fetchMyRecipes, loadMine]);

  // --- Профиль вкуса: та же персистентность, что и в поиске (localStorage +
  //     user_metadata для залогиненного). ---
  const savePreferences = (nextAllergies: string[], nextDislikes: string[]) => {
    try {
      localStorage.setItem("sc_allergies", JSON.stringify(nextAllergies));
      localStorage.setItem("sc_dislikes", JSON.stringify(nextDislikes));
    } catch {}
    if (user) supabase.auth.updateUser({ data: { allergies: nextAllergies, dislikes: nextDislikes } });
  };
  const addAllergy = () => {
    if (!newAllergy.trim()) return;
    const updated = [...allergies, newAllergy.trim().toLowerCase()];
    setAllergies(updated);
    setNewAllergy("");
    savePreferences(updated, dislikes);
  };
  const addDislike = () => {
    if (!newDislike.trim()) return;
    const updated = [...dislikes, newDislike.trim().toLowerCase()];
    setDislikes(updated);
    setNewDislike("");
    savePreferences(allergies, updated);
  };
  const removeAllergy = (idx: number) => {
    const updated = allergies.filter((_, i) => i !== idx);
    setAllergies(updated);
    savePreferences(updated, dislikes);
  };
  const removeDislike = (idx: number) => {
    const updated = dislikes.filter((_, i) => i !== idx);
    setDislikes(updated);
    savePreferences(allergies, updated);
  };

  // --- Авторизация гостя (общий хук). ---
  const { open: openAuth, authModalProps } = useAuthModal({
    onAuthenticated: async (_authedUser, outcome) => {
      reachGoal(outcome === "register" ? "auth_signup" : outcome === "recover" ? "auth_recover" : "auth_login");
      await claimGuestPartiesToAccount();
      if (outcome === "register") toast.success("Добро пожаловать, шеф!");
    },
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  // Полное удаление аккаунта: серверный роут сносит данные пользователя в БД и
  // storage, затем чистим ВСЕ локальные следы приложения на устройстве
  // (профиль вкуса, счётчики, списки покупок, гостевые банкеты) и выходим.
  const clearLocalAppData = () => {
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith("sc_") || k.startsWith("cook_") || k.startsWith("smartcook_"))) {
          keys.push(k);
        }
      }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch {}
  };

  const handleDeleteAccount = async () => {
    if (isDeletingAccount) return;
    setIsDeletingAccount(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok) throw new Error("delete failed");
      reachGoal("account_deleted");
      clearLocalAppData();
      await supabase.auth.signOut();
      setIsDeleteAccountOpen(false);
      toast.success("Аккаунт удалён");
      router.push("/");
    } catch {
      toast.error("Не удалось удалить аккаунт. Попробуйте позже");
    } finally {
      setIsDeletingAccount(false);
    }
  };

  // --- Редактирование профиля (имя/username/аватар). ---
  const handleAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    try {
      // HEIC не отрендерится в кроппере (<img>) на Android — декодируем заранее.
      const decoded = await decodeHeicIfNeeded(files[0]);
      setCropImageSrc(URL.createObjectURL(decoded));
      setIsCropping(true);
    } catch (error) {
      void reportPhotoError("avatar", files[0], error);
      toast.error("Не удалось обработать фото");
    }
  };
  const onCropComplete = (_area: Area, areaPixels: Area) => setCroppedAreaPixels(areaPixels);
  const handleCropConfirm = async () => {
    if (!cropImageSrc || !croppedAreaPixels) return;
    try {
      const croppedFile = await getCroppedImg(cropImageSrc, croppedAreaPixels);
      if (!croppedFile) return;
      const imageCompression = (await import("browser-image-compression")).default;
      const compressed = await imageCompression(croppedFile, {
        maxSizeMB: 0.3,
        maxWidthOrHeight: 500,
        useWebWorker: true,
        fileType: "image/jpeg",
      });
      const finalFile = new File([compressed], `avatar_${Date.now()}.jpg`, { type: "image/jpeg" });
      setEditAvatarFile(finalFile);
      setEditAvatarPreview(URL.createObjectURL(finalFile));
      setIsCropping(false);
      setCropImageSrc(null);
    } catch (e) {
      void reportPhotoError("avatar-crop", null, e);
      toast.error("Не удалось обработать фото");
      setEditAvatarFile(null);
      setEditAvatarPreview(null);
    }
  };
  const handleProfileSave = async () => {
    if (!user) return;
    setIsSavingProfile(true);
    try {
      let avatarUrl = user.user_metadata?.avatar_url;
      if (editAvatarFile) {
        const fileName = `${user.id}/avatar_${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(fileName, editAvatarFile, { upsert: true });
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from("avatars").getPublicUrl(fileName);
        avatarUrl = data.publicUrl + "?t=" + Date.now();
      }

      const newUsername = editUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
      if (newUsername.length < 4) throw new Error("Username от 4 символов (буквы, цифры, _)");

      const { data, error } = await supabase.auth.updateUser({
        data: { full_name: editProfileName, avatar_url: avatarUrl, username: newUsername },
      });
      if (error) throw error;
      setUser(data.user);
      setIsEditingProfile(false);
      toast.success("Профиль сохранён");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка сохранения профиля");
    } finally {
      setIsSavingProfile(false);
    }
  };

  // --- Мои посты ленты: удаление отклонённого (RLS разрешает автору delete). ---
  const deleteMyPost = async (id: string) => {
    if (!confirm("Удалить этот пост?")) return;
    try {
      const { error } = await supabase.from("community_posts").delete().eq("id", id);
      if (error) throw error;
      setMyPosts((prev) => prev.filter((p) => p.id !== id));
      toast.success("Пост удалён");
    } catch {
      toast.error("Не удалось удалить");
    }
  };

  const statusBadge = (status: MyPost["status"]) => {
    if (status === "approved")
      return { text: "Опубликован", color: "var(--color-success)", icon: <CheckCircle2 size={14} /> };
    if (status === "rejected")
      return { text: "Отклонён", color: "var(--color-danger)", icon: <XCircle size={14} /> };
    return { text: "На модерации", color: "var(--color-warning)", icon: <Clock size={14} /> };
  };

  const openRecipe = (item: DBRecipe) => {
    if (item.id) router.push(`/search?recipeId=${item.id}`);
  };

  const isDev = user?.id === DEVELOPER_ID;
  const favorites = feed.filter((r) => r.is_favorite);
  const joined = formatJoined(user?.created_at);

  // Пока сессия не проверена — не мигаем гостевым экраном.
  if (!authChecked) {
    return <div style={{ minHeight: "60vh" }} />;
  }

  // ---------- ГОСТЬ ----------
  if (!user) {
    return (
      <div className="container" style={{ paddingTop: "calc(env(safe-area-inset-top) + var(--space-6))", paddingBottom: "var(--space-6)" }}>
        <div style={{ maxWidth: "440px", margin: "0 auto", textAlign: "center" }}>
          <div style={{ background: "var(--color-bg-subtle)", width: "88px", height: "88px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto var(--space-4) auto" }}>
            <UserIcon size={44} color="var(--color-text-muted)" />
          </div>
          <h1 style={{ fontSize: "var(--font-size-title)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)", margin: "0 0 var(--space-2) 0" }}>
            Создайте аккаунт
          </h1>
          <p style={{ color: "var(--color-text-secondary)", lineHeight: 1.5, margin: "0 0 var(--space-5) 0", fontSize: "var(--font-size-body)" }}>
            Бесплатно, только имя и пароль — без почты. Вот что вы получите:
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", textAlign: "left", marginBottom: "var(--space-5)" }}>
            {[
              { icon: History, title: "История не потеряется", text: "Все найденные рецепты останутся с вами на любом устройстве." },
              { icon: Heart, title: "Избранное под рукой", text: "Любимые рецепты — в один тап, всегда рядом." },
              { icon: ImageIcon, title: "Свои блюда в ленте", text: "Делитесь фото готовых блюд с сообществом." },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-start", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "var(--space-3) var(--space-4)" }}>
                <div style={{ flexShrink: 0, width: "40px", height: "40px", borderRadius: "50%", background: "var(--color-accent-subtle)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon size={20} color="var(--color-accent)" />
                </div>
                <div>
                  <div style={{ fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)", fontSize: "var(--font-size-body)", marginBottom: "2px" }}>{title}</div>
                  <div style={{ color: "var(--color-text-secondary)", fontSize: "var(--font-size-caption)", lineHeight: 1.45 }}>{text}</div>
                </div>
              </div>
            ))}
          </div>

          <Button variant="primary" onClick={() => openAuth("register")} style={{ width: "100%", fontSize: "var(--font-size-body)", padding: "var(--space-4)" }}>
            Регистрация
          </Button>
          <button
            type="button"
            onClick={() => openAuth("login")}
            style={{ marginTop: "var(--space-3)", background: "none", border: "none", color: "var(--color-text-secondary)", fontSize: "var(--font-size-body)", cursor: "pointer", textDecoration: "underline", padding: "var(--space-2)" }}
          >
            У меня уже есть аккаунт
          </button>
        </div>

        <AuthModal {...authModalProps} />
      </div>
    );
  }

  // ---------- ЗАЛОГИНЕН ----------
  const displayName = user.user_metadata?.full_name || "Шеф";
  const username = user.user_metadata?.username || user.email?.split("@")[0];

  return (
    <div className="container" style={{ paddingTop: "calc(env(safe-area-inset-top) + var(--space-5))", paddingBottom: "var(--space-6)" }}>
      <div style={{ maxWidth: "560px", margin: "0 auto" }}>
        {/* Шапка профиля */}
        <div className="card" style={{ padding: 0, textAlign: "center", marginBottom: "var(--space-3)", overflow: "hidden", border: "none", boxShadow: "0 10px 30px -10px rgba(0,0,0,0.1)" }}>
          <div style={{ background: "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-hover) 100%)", height: "96px", width: "100%" }} />
          <div style={{ position: "relative", width: "90px", height: "90px", margin: "-45px auto var(--space-3) auto", background: "var(--color-surface)", borderRadius: "50%", padding: "4px" }}>
            {user.user_metadata?.avatar_url ? (
              <img src={user.user_metadata.avatar_url} alt="Аватар" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
            ) : (
              <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: "var(--color-accent)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "32px", fontWeight: "var(--font-weight-semibold)" }}>
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          <div style={{ padding: "0 var(--space-4) var(--space-4) var(--space-4)" }}>
            <h1 style={{ margin: "0 0 var(--space-1) 0", fontSize: "var(--font-size-heading)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)", display: "flex", alignItems: "center", justifyContent: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
              {displayName}
              {isDev && (
                <span style={{ fontSize: "var(--font-size-caption)", background: "var(--color-text)", color: "white", padding: "var(--space-1) var(--space-2)", borderRadius: "var(--radius-full)", fontWeight: "var(--font-weight-semibold)", display: "inline-flex", alignItems: "center", gap: "var(--space-1)", lineHeight: 1 }}>
                  <Code2 size={12} /> Разработчик
                </span>
              )}
            </h1>
            <p style={{ margin: "0 0 var(--space-1) 0", fontSize: "var(--font-size-caption)", color: "var(--color-accent)", fontWeight: "var(--font-weight-semibold)" }}>
              @{username}
            </p>
            {joined && (
              <p style={{ margin: "0 0 var(--space-4) 0", fontSize: "var(--font-size-caption)", color: "var(--color-text-muted)" }}>
                {joined}
              </p>
            )}

            <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "center" }}>
              <button onClick={() => setIsEditingProfile(true)} style={{ background: "var(--color-bg-subtle)", border: "none", padding: "var(--space-2) var(--space-4)", borderRadius: "var(--radius-full)", fontSize: "var(--font-size-body)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: "var(--space-1)", cursor: "pointer" }}>
                <Edit3 size={16} /> Изменить
              </button>
              <button onClick={handleLogout} style={{ background: "var(--color-danger-subtle)", border: "none", padding: "var(--space-2) var(--space-4)", borderRadius: "var(--radius-full)", fontSize: "var(--font-size-body)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-danger)", display: "flex", alignItems: "center", gap: "var(--space-1)", cursor: "pointer" }}>
                <LogOut size={16} /> Выйти
              </button>
            </div>
          </div>
        </div>

        {/* Профиль вкуса */}
        <div className="card" style={{ padding: "var(--space-4)", marginBottom: "var(--space-3)" }}>
          <h2 style={{ margin: "0 0 var(--space-1) 0", fontSize: "var(--font-size-body)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)" }}>Настройки питания</h2>
          <p style={{ fontSize: "var(--font-size-caption)", color: "var(--color-text-secondary)", margin: "0 0 var(--space-3) 0" }}>Учитываем их, когда подбираем рецепты.</p>
          {(allergies.length > 0 || dislikes.length > 0) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)", marginBottom: "var(--space-3)" }}>
              {allergies.map((a, i) => (
                <span key={`a${i}`} style={{ fontSize: "var(--font-size-caption)", color: "var(--color-danger)", border: "1px solid var(--color-danger)", background: "var(--color-surface)", padding: "3px var(--space-2)", borderRadius: "var(--radius-full)", fontWeight: "var(--font-weight-medium)" }}>{a}</span>
              ))}
              {dislikes.map((d, i) => (
                <span key={`d${i}`} style={{ fontSize: "var(--font-size-caption)", color: "var(--color-warning)", background: "var(--color-warning-subtle)", padding: "3px var(--space-2)", borderRadius: "var(--radius-full)", fontWeight: "var(--font-weight-medium)" }}>{d}</span>
              ))}
            </div>
          )}
          <button onClick={() => setIsPreferencesOpen(true)} style={{ width: "100%", padding: "var(--space-3)", borderRadius: "var(--radius-sm)", background: "var(--color-bg)", border: "1px solid var(--color-border)", display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--color-text)", fontWeight: "var(--font-weight-semibold)", fontSize: "var(--font-size-body)", cursor: "pointer" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}><Settings size={18} color="var(--color-text-secondary)" /> Аллергии и нелюбимое</span>
            <ChevronRight size={18} color="var(--color-text-muted)" />
          </button>
        </div>

        {/* Мои посты в ленте (все статусы) */}
        {myPosts.length > 0 && (
          <div className="card" style={{ padding: "var(--space-4)", marginBottom: "var(--space-3)" }}>
            <h2 style={{ margin: "0 0 var(--space-3) 0", fontSize: "var(--font-size-body)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)" }}>Мои посты в ленте</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {myPosts.map((p) => {
                const badge = statusBadge(p.status);
                return (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", padding: "var(--space-2)" }}>
                    <img src={p.photo_url} alt={p.recipe_title || "Блюдо"} loading="lazy" style={{ width: "56px", height: "56px", borderRadius: "var(--radius-sm)", objectFit: "cover", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)", fontSize: "var(--font-size-body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.recipe_title || "Блюдо"}</div>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "var(--font-size-caption)", color: badge.color, fontWeight: "var(--font-weight-semibold)", marginTop: "2px" }}>
                        {badge.icon} {badge.text}
                      </span>
                    </div>
                    {p.status === "rejected" && (
                      <button type="button" onClick={() => deleteMyPost(p.id)} aria-label="Удалить пост" style={{ flexShrink: 0, background: "var(--color-danger-subtle)", border: "none", color: "var(--color-danger)", borderRadius: "var(--radius-sm)", padding: "var(--space-2)", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", fontSize: "var(--font-size-caption)", fontWeight: "var(--font-weight-semibold)" }}>
                        <Trash2 size={16} /> Удалить
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Вкладки История / Избранное */}
        <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
          <button onClick={() => setTab("history")} style={{ flex: 1, padding: "var(--space-3)", borderRadius: "var(--radius-sm)", border: "none", background: tab === "history" ? "var(--color-text)" : "var(--color-surface)", color: tab === "history" ? "white" : "var(--color-text-secondary)", fontWeight: "var(--font-weight-semibold)", fontSize: "var(--font-size-body)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "var(--space-1)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <History size={16} /> История
          </button>
          <button onClick={() => setTab("favorites")} style={{ flex: 1, padding: "var(--space-3)", borderRadius: "var(--radius-sm)", border: "none", background: tab === "favorites" ? "var(--color-text)" : "var(--color-surface)", color: tab === "favorites" ? "white" : "var(--color-text-secondary)", fontWeight: "var(--font-weight-semibold)", fontSize: "var(--font-size-body)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "var(--space-1)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <Heart size={16} /> Избранное ({favorites.length})
          </button>
        </div>

        {tab === "history" && (
          <div className="animate-fade-in">
            {feed.length === 0 ? (
              <div style={{ textAlign: "center", padding: "var(--space-5) var(--space-4)" }}>
                <ChefHat size={36} style={{ display: "block", margin: "0 auto var(--space-2) auto", opacity: 0.6 }} />
                <div style={{ color: "var(--color-text)", fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--space-1)" }}>История пуста</div>
                <div style={{ color: "var(--color-text-secondary)", fontSize: "var(--font-size-caption)" }}>Найдите свой первый рецепт по фото или названию.</div>
              </div>
            ) : (
              <RecipeList items={feed} onOpen={openRecipe} />
            )}
          </div>
        )}

        {tab === "favorites" && (
          <div className="animate-fade-in">
            {favorites.length === 0 ? (
              <div style={{ textAlign: "center", padding: "var(--space-5) var(--space-4)" }}>
                <HeartCrack size={36} style={{ display: "block", margin: "0 auto var(--space-2) auto", opacity: 0.6 }} />
                <div style={{ color: "var(--color-text)", fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--space-1)" }}>В избранном пока пусто</div>
                <div style={{ color: "var(--color-text-secondary)", fontSize: "var(--font-size-caption)" }}>Добавляйте рецепты лайком, чтобы вернуться к ним позже.</div>
              </div>
            ) : (
              <RecipeList items={favorites} onOpen={openRecipe} />
            )}
          </div>
        )}

        {/* Опасная зона: удаление аккаунта (App Store 5.1.1(v)). Внизу, отдельно,
            неакцентная ссылка — не провоцирует случайный тап, но всегда доступна. */}
        <div style={{ marginTop: "var(--space-6)", paddingTop: "var(--space-4)", borderTop: "1px solid var(--color-border)", textAlign: "center" }}>
          <button
            type="button"
            onClick={() => setIsDeleteAccountOpen(true)}
            style={{ background: "none", border: "none", color: "var(--color-danger)", fontSize: "var(--font-size-caption)", fontWeight: "var(--font-weight-semibold)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "var(--space-1)", padding: "var(--space-2)" }}
          >
            <AlertTriangle size={14} /> Удалить аккаунт
          </button>
        </div>
      </div>

      {/* Модалки */}
      <PreferencesModal
        isOpen={isPreferencesOpen}
        onClose={() => setIsPreferencesOpen(false)}
        allergies={allergies}
        dislikes={dislikes}
        newAllergy={newAllergy}
        setNewAllergy={setNewAllergy}
        newDislike={newDislike}
        setNewDislike={setNewDislike}
        addAllergy={addAllergy}
        addDislike={addDislike}
        removeAllergy={removeAllergy}
        removeDislike={removeDislike}
        isLoggedIn={!!user}
      />
      <EditProfileModal
        isOpen={isEditingProfile}
        user={user}
        editAvatarPreview={editAvatarPreview}
        editProfileName={editProfileName}
        setEditProfileName={setEditProfileName}
        editUsername={editUsername}
        setEditUsername={setEditUsername}
        handleAvatarChange={handleAvatarChange}
        handleProfileSave={handleProfileSave}
        isSavingProfile={isSavingProfile}
        onCancel={() => setIsEditingProfile(false)}
      />
      <CropperModal
        isCropping={isCropping}
        cropImageSrc={cropImageSrc}
        crop={crop}
        setCrop={setCrop}
        zoom={zoom}
        setZoom={setZoom}
        onCropComplete={onCropComplete}
        onCancel={() => { setIsCropping(false); setCropImageSrc(null); }}
        onConfirm={handleCropConfirm}
      />
      <DeleteAccountModal
        isOpen={isDeleteAccountOpen}
        isDeleting={isDeletingAccount}
        onConfirm={handleDeleteAccount}
        onClose={() => setIsDeleteAccountOpen(false)}
      />
    </div>
  );
}

// Список рецептов (история/избранное) — карточка с названием, временем и калориями.
function RecipeList({ items, onOpen }: { items: DBRecipe[]; onOpen: (item: DBRecipe) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "var(--space-3)" }}>
      {items.map((item) => (
        <div
          key={item.id}
          onClick={() => onOpen(item)}
          style={{ background: "var(--color-surface)", padding: "var(--space-3) var(--space-4)", borderRadius: "var(--radius-md)", cursor: "pointer", display: "flex", flexDirection: "column", gap: "var(--space-2)", boxShadow: "0 4px 15px rgba(0,0,0,0.03)", border: "1px solid var(--color-border)" }}
        >
          <div style={{ fontWeight: "var(--font-weight-semibold)", fontSize: "var(--font-size-body)", color: "var(--color-text)", lineHeight: 1.3 }}>
            {item.title}
            {item.is_favorite && <Heart size={14} fill="#dc2626" color="#dc2626" style={{ display: "inline-block", marginLeft: "var(--space-1)", verticalAlign: "middle", marginTop: "-2px" }} />}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--font-size-caption)", color: "var(--color-text-secondary)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px", background: "var(--color-bg)", padding: "var(--space-1) var(--space-2)", borderRadius: "var(--radius-sm)" }}>
              <Clock size={14} /> {formatCookingTime(item.cooking_time_minutes) || formatTime(item.time)}
            </span>
            {item.calories && (
              <span style={{ display: "flex", alignItems: "center", gap: "4px", background: "var(--color-bg)", padding: "var(--space-1) var(--space-2)", borderRadius: "var(--radius-sm)" }}>
                <Flame size={14} /> {formatCalories(item.calories)}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
