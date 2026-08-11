"use client";

import { useRef, useState } from "react";
import { useConnect } from "@/contexts/connect-context";
import { Avatar, Header, Button, TextInput, cx } from "./ui";
import { Sheet } from "./feedback";
import {
  IconCamera,
  IconCopy,
  IconCheck,
  IconGlobe,
  IconEdit,
  IconShield,
  IconChevron,
  IconSparkle,
} from "./icons";
import { LANGUAGES, fileToAvatar, type LangId, type UserStatus } from "@/lib/connect/data";
import { IconLogout } from "./icons";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { PRODUCT_CONFIG } from "@/lib/product-config";

export function ProfileView() {
  const { t, profile, setLanguage, pushToast, logout, updateProfile } = useConnect();
  const { sdk, products, restoredPurchases, premiumActive, setPremiumActive } = usePiAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [premiumBusy, setPremiumBusy] = useState(false);

  const premiumProduct = products?.find(
    (product) => product.id === PRODUCT_CONFIG.PRODUCT_6a7b58c52ac65f143bd43595,
  );
  const restoredList = Array.isArray(restoredPurchases)
    ? restoredPurchases
    : (restoredPurchases as unknown as { purchases?: { productId: string; quantity: number }[] } | null)?.purchases;
  const premiumQuantity = restoredList?.find(
    (purchase) => purchase.productId === premiumProduct?.slug,
  )?.quantity ?? 0;

  const buyPremium = async () => {
    if (!premiumProduct || !sdk || premiumBusy) return;
    setPremiumBusy(true);
    try {
      const result = await sdk.makePurchase(premiumProduct.slug);
      if (result.ok) {
        await setPremiumActive(true);
        pushToast(`${premiumProduct.name} purchased successfully.`, "success");
      }
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "purchase_error";
      const message = code === "purchase_cancelled"
        ? "Purchase cancelled."
        : code === "product_not_found"
          ? "Premium Access is currently unavailable."
          : "Purchase could not be completed.";
      pushToast(message, "error");
    } finally {
      setPremiumBusy(false);
    }
  };
  const [langOpen, setLangOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(`@${profile.username}`);
    } catch {
      /* ignore */
    }
    setCopied(true);
    pushToast(t.copied, "success");
    setTimeout(() => setCopied(false), 1600);
  };

  const currentLang = LANGUAGES.find((l) => l.id === profile.language);

  return (
    <div className="pb-24">
      <Header title={t.profileTitle} />

      {/* identity hero */}
      <div className="px-4 pt-4">
        <div className="pc-glass flex flex-col items-center rounded-3xl p-6 text-center">
          <Avatar name={profile.displayName} color={280} src={profile.avatar} size={100} />
          <h2 className="mt-4 text-xl font-bold">{profile.displayName}</h2>
          <p className="text-sm text-turquoise">@{profile.username}</p>
          <Button variant="outline" className="mt-4 py-2.5" onClick={() => setEditOpen(true)}>
            <IconEdit className="h-4 w-4" />
            {t.editProfile}
          </Button>
        </div>
      </div>

      {/* digital ID */}
      <div className="mt-4 px-4">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t.yourDigitalId}</h3>
        <button
          onClick={copyId}
          className="pc-press flex w-full items-center gap-3 rounded-2xl pc-glass p-4 text-start"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-turquoise/15 text-turquoise">
            <IconShield className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold text-foreground">@{profile.username}</p>
            <p className="truncate text-xs text-muted-foreground">{t.digitalIdHint}</p>
          </div>
          {copied ? <IconCheck className="h-5 w-5 text-success" /> : <IconCopy className="h-5 w-5 text-muted-foreground" />}
        </button>
      </div>

      {/* status */}
      <div className="mt-4 px-4">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t.status || "Status"}</h3>
        <button
          onClick={() => setStatusOpen(true)}
          className="pc-press flex w-full items-center gap-3 rounded-2xl pc-glass p-4 text-start"
        >
          <span className={cx("flex h-4 w-4 items-center justify-center rounded-full", {
            "bg-success": profile.status === "available",
            "bg-yellow-500": profile.status === "away",
            "bg-red-500": profile.status === "busy",
            "bg-gray-500": profile.status === "offline",
          })} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground capitalize">{profile.status}</p>
            {profile.statusText && <p className="text-xs text-muted-foreground truncate">{profile.statusText}</p>}
          </div>
          <IconChevron className="h-5 w-5 text-muted-foreground rtl:rotate-180" />
        </button>
      </div>

      {/* settings */}
      <div className="mt-4 px-4">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t.settings}</h3>
        <button
          onClick={() => setLangOpen(true)}
          className="pc-press flex w-full items-center gap-3 rounded-2xl pc-glass p-4 text-start"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gold/15 text-gold">
            <IconGlobe className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">{t.language}</p>
            <p className="text-xs text-muted-foreground">
              {currentLang?.label} · {currentLang?.english}
            </p>
          </div>
          <IconChevron className="h-5 w-5 text-muted-foreground rtl:rotate-180" />
        </button>
      </div>

      {/* future premium access — intentionally limited to Profile/Settings */}
      <div className="mt-4 px-4">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Premium Access</h3>
        <div className="rounded-2xl pc-glass p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold">
              <IconSparkle className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground">{premiumProduct?.name || "One Connect Premium Access"}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {premiumProduct?.description || "Future premium access for One Connect. Pricing and subscription rules will be finalized after backend integration."}
              </p>
              {premiumQuantity > 0 && (
                <p className="mt-2 text-xs font-semibold text-success">Access restored</p>
              )}
            </div>
          </div>
          {premiumActive ? (
            <div className="mt-4 rounded-xl bg-success/10 px-4 py-3 text-center text-sm font-semibold text-success">
              Premium Active
            </div>
          ) : (
            <Button
              variant="primary"
              className="mt-4 w-full py-3"
              disabled={!premiumProduct || !sdk || premiumBusy}
              onClick={buyPremium}
            >
              {premiumBusy
                ? "Processing..."
                : premiumProduct
                  ? `Get Premium Access · ${premiumProduct.price_in_pi} Pi`
                  : "Premium Access unavailable"}
            </Button>
          )}
          {!premiumProduct && products !== null && (
            <p className="mt-2 text-center text-xs text-destructive">This product is not currently available.</p>
          )}
        </div>
      </div>

      {/* about */}
      <div className="mt-4 px-4">
        <div className="rounded-2xl pc-glass p-5">
          <div className="flex items-center gap-2">
            <IconSparkle className="h-5 w-5 text-primary" />
            <h3 className="font-bold">{t.aboutTitle}</h3>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">{t.aboutBody}</p>
          <div className="mt-3 flex items-center gap-2 text-xs text-turquoise">
            <IconShield className="h-4 w-4" />
            <span>{t.encrypted}</span>
          </div>
        </div>
      </div>

      {/* logout */}
      <div className="mt-4 px-4 pb-4">
        <Button variant="outline" className="w-full py-3 text-destructive border-destructive/50 hover:bg-destructive/10" onClick={logout}>
          <IconLogout className="h-4 w-4" />
          {t.logout || "Logout"}
        </Button>
      </div>

      <EditProfileSheet open={editOpen} onClose={() => setEditOpen(false)} />

      {/* status sheet */}
      <StatusSheet open={statusOpen} onClose={() => setStatusOpen(false)} />

      {/* language sheet */}
      <Sheet open={langOpen} onClose={() => setLangOpen(false)} title={t.language}>
        <ul className="grid grid-cols-1 gap-1 pb-2">
          {LANGUAGES.map((l) => (
            <li key={l.id}>
              <button
                onClick={() => {
                  setLanguage(l.id as LangId);
                  setLangOpen(false);
                }}
                className={cx(
                  "pc-press flex w-full items-center gap-3 rounded-xl px-4 py-3 text-start",
                  profile.language === l.id ? "bg-primary/15" : "hover:bg-card/50",
                )}
              >
                <span className="flex-1">
                  <span className="font-semibold text-foreground">{l.label}</span>
                  <span className="ms-2 text-xs text-muted-foreground">{l.english}</span>
                </span>
                {profile.language === l.id && <IconCheck className="h-5 w-5 text-primary" />}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  );
}

function StatusSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, profile, updateProfile, pushToast } = useConnect();
  const [status, setStatus] = useState<UserStatus>(profile.status);
  const [statusText, setStatusText] = useState(profile.statusText || "");

  const statuses: UserStatus[] = ["available", "away", "busy", "offline"];
  const statusLabels: Record<UserStatus, string> = {
    available: t.available || "Available",
    away: t.away || "Away",
    busy: t.busy || "Busy",
    offline: t.offline || "Offline",
  };

  const save = () => {
    updateProfile({ status, statusText });
    pushToast(t.save, "success");
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={t.status || "Status"}>
      <div className="flex flex-col pb-2">
        <div className="mb-4">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t.status || "Status"}</label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {statuses.map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={cx(
                  "pc-press flex items-center gap-2 rounded-xl px-3 py-2.5",
                  status === s ? "bg-primary/15 border border-primary" : "bg-card/50 border border-card",
                )}
              >
                <span className={cx("h-3 w-3 rounded-full", {
                  "bg-success": s === "available",
                  "bg-yellow-500": s === "away",
                  "bg-red-500": s === "busy",
                  "bg-gray-500": s === "offline",
                })} />
                <span className="text-sm font-semibold capitalize">{statusLabels[s]}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t.statusMessage || "Status Message"}</label>
          <TextInput
            className="mt-2"
            value={statusText}
            maxLength={100}
            placeholder={t.statusMessagePh || "e.g., In a meeting..."}
            onChange={(e) => setStatusText(e.target.value)}
          />
        </div>

        <Button variant="primary" className="mt-5 w-full py-3.5" onClick={save}>
          {t.save}
        </Button>
      </div>
    </Sheet>
  );
}

function EditProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, profile, updateProfile, pushToast } = useConnect();
  const [name, setName] = useState(profile.displayName);
  const [avatar, setAvatar] = useState<string | null>(profile.avatar);
  const fileRef = useRef<HTMLInputElement>(null);
  const seeded = useRef(false);

  if (open && !seeded.current) {
    seeded.current = true;
    setName(profile.displayName);
    setAvatar(profile.avatar);
  }
  if (!open && seeded.current) seeded.current = false;

  const onPick = async (file?: File) => {
    if (!file) return;
    try {
      setAvatar(await fileToAvatar(file));
    } catch {
      pushToast("Could not load image", "error");
    }
  };

  const save = () => {
    if (!name.trim()) {
      pushToast(t.enterName, "error");
      return;
    }
    updateProfile({ displayName: name, avatar });
    pushToast(t.save, "success");
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={t.editProfile}>
      <div className="flex flex-col items-center pb-2">
        <button onClick={() => fileRef.current?.click()} className="pc-press relative" aria-label={t.changePhoto}>
          <Avatar name={name || "?"} color={280} src={avatar} size={92} />
          <span className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-turquoise text-turquoise-foreground border-2 border-background">
            <IconCamera className="h-4 w-4" />
          </span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPick(e.target.files?.[0])} />

        <div className="mt-6 w-full">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t.displayName}</label>
          <TextInput
            className="mt-2"
            value={name}
            maxLength={40}
            placeholder={t.displayNamePh}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <Button variant="primary" className="mt-5 w-full py-3.5" onClick={save}>
          {t.save}
        </Button>
      </div>
    </Sheet>
  );
}
