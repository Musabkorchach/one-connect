"use client";

import { useRef, useState } from "react";
import { useConnect } from "@/contexts/connect-context";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { Avatar, Button, TextInput } from "./ui";
import { IconCamera, IconShield, IconSparkle } from "./icons";
import { fileToAvatar } from "@/lib/connect/data";

export function SetupView() {
  const { t, finishSetup, pushToast } = useConnect();
  const { piUsername } = usePiAuth();
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onPick = async (file?: File) => {
    if (!file) return;
    try {
      const url = await fileToAvatar(file);
      setAvatar(url);
    } catch {
      pushToast("Could not load image", "error");
    }
  };

  const submit = () => {
    if (!name.trim()) {
      pushToast(t.enterName, "error");
      return;
    }
    finishSetup(name, avatar, piUsername);
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-background">
      <div className="pc-aurora" />
      <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-10">
        <div className="pc-fade-up w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="pc-orb mb-5 flex h-20 w-20 items-center justify-center rounded-3xl pc-glass-strong">
              <span className="text-3xl font-black pc-brand-text">Pi</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-balance">{t.welcome}</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">{t.welcomeSub}</p>
          </div>

          <div className="pc-glass rounded-3xl p-6">
            <div className="flex flex-col items-center">
              <button
                onClick={() => fileRef.current?.click()}
                className="pc-press relative"
                aria-label={t.changePhoto}
              >
                <Avatar name={name || "?"} color={280} src={avatar} size={92} />
                <span className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-turquoise text-turquoise-foreground border-2 border-background">
                  <IconCamera className="h-4 w-4" />
                </span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onPick(e.target.files?.[0])}
              />
            </div>

            <label className="mt-6 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t.displayName}
            </label>
            <TextInput
              className="mt-2"
              value={name}
              maxLength={40}
              placeholder={t.displayNamePh}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) submit();
              }}
            />

            <Button variant="primary" className="mt-5 w-full py-3.5" onClick={submit}>
              {t.continue}
            </Button>
          </div>

          <div className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <IconShield className="h-4 w-4 text-turquoise" />
            <span>{t.encrypted}</span>
          </div>
          <div className="mt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <IconSparkle className="h-4 w-4 text-gold" />
            <span>{t.tagline}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
