"use client";

import { useEffect, useState, type FormEvent } from "react";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { loadPhoneContacts, savePhoneContacts, type PhoneContact } from "@/lib/connect/phone-contacts";
import { Phone } from "lucide-react";

export function PstnDialer({
  onCall,
  disabled = false,
}: {
  onCall: (phone: string) => void;
  disabled?: boolean;
}) {
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [contactName, setContactName] = useState("");
  const [savingContact, setSavingContact] = useState(false);
  const [contactMessage, setContactMessage] = useState("");
  const { isAuthenticated, sessionToken } = usePiAuth();
  const contactSession = isAuthenticated ? sessionToken : null;
  const [contactState, setContactState] = useState<{
    token: string;
    items: PhoneContact[];
    failed: boolean;
  } | null>(null);

  const currentContacts =
    contactSession && contactState?.token === contactSession ? contactState : null;

  useEffect(() => {
    setContactState(null);
    if (!contactSession) return;

    let active = true;

    loadPhoneContacts(contactSession)
      .then((items) => {
        if (active) setContactState({ token: contactSession, items, failed: false });
      })
      .catch(() => {
        if (active) setContactState({ token: contactSession, items: [], failed: true });
      });

    return () => {
      active = false;
    };
  }, [contactSession]);

    const normalizePhone = () => {
    let normalized = phone.trim().replace(/[\s().-]/g, "");

    if (normalized.startsWith("0033")) {
      normalized = `+33${normalized.slice(4)}`;
    } else if (/^0[1-79]\d{8}$/.test(normalized)) {
      normalized = `+33${normalized.slice(1)}`;
    }

    return /^\+33[1-79]\d{8}$/.test(normalized) ? normalized : null;
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) return;

    const normalized = normalizePhone();
    if (!normalized) {
      setError("Enter a French phone number. Short numbers and 08 are excluded.");
      return;
    }

    setError(null);
    onCall(normalized);
  };

  const saveCurrentPhone = async () => {
    if (disabled || savingContact || !contactSession || !currentContacts || currentContacts.failed) return;

    const name = contactName.trim();
    const normalized = normalizePhone();
    if (!name) return;

    if (!normalized) {
      setContactMessage("أدخل رقم هاتف فرنسي صالحًا للحفظ.");
      return;
    }

    const items = [
      { name, phone: normalized },
      ...currentContacts.items.filter((item) => item.phone !== normalized),
    ];

    setSavingContact(true);
    setContactMessage("");

    try {
      await savePhoneContacts(items, contactSession);
      setContactState((current) =>
        current?.token === contactSession ? { ...current, items } : current,
      );
      setContactName("");
      setContactMessage("تم حفظ الرقم.");
    } catch {
      setContactMessage("تعذّر حفظ الرقم. حاول مرة أخرى.");
    } finally {
      setSavingContact(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="mx-5 mt-4 rounded-2xl border border-border bg-card p-4"
    >
      <label htmlFor="pstn-phone" className="block font-semibold">
        Call a phone number
      </label>

      <p className="mt-1 text-xs text-muted-foreground">
        France · Approved test numbers only · Maximum 2 minutes
      </p>

            {currentContacts?.failed && (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          تعذّر تحميل الأرقام المحفوظة. يمكنك إدخال الرقم يدويًا.
        </p>
      )}

      {currentContacts && currentContacts.items.length > 0 && (
        <select
          aria-label="اختر رقمًا محفوظًا"
          value=""
          disabled={disabled}
          onChange={(event) => {
            if (!event.target.value) return;
            setPhone(event.target.value);
            setError(null);
          }}
          className="mt-3 w-full rounded-xl border border-border bg-input px-3 py-2"
        >
          <option value="" disabled>اختر رقمًا محفوظًا</option>
          {currentContacts.items.map(({ name, phone }) => (
            <option key={phone} value={phone}>{name} — {phone}</option>
          ))}
        </select>
      )}
      <div className="mt-3 flex gap-2">
        <input
          id="pstn-phone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          dir="ltr"
          value={phone}
          maxLength={40}
          required
          disabled={disabled}
          onChange={(event) => {
            setPhone(event.target.value);
            setError(null);
          }}
          placeholder="+33 …"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "pstn-phone-error" : undefined}
          className="min-w-0 flex-1 rounded-xl border border-border bg-input px-3 py-3 outline-none focus:border-primary disabled:opacity-50"
        />

        <button
          type="submit"
          disabled={disabled || !phone.trim()}
          aria-label="Call phone number"
          className="pc-press flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-turquoise text-turquoise-foreground disabled:opacity-40"
        >
          <Phone className="h-5 w-5" />
        </button>
      </div>

            <div
        dir="ltr"
        role="group"
        aria-label="لوحة الأرقام"
        className="mt-3 grid grid-cols-3 gap-2"
      >
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "+", "0", "⌫"].map((key) => (
          <button
            key={key}
            type="button"
            disabled={disabled || (key === "⌫" ? !phone : key === "+" && Boolean(phone))}
            aria-label={key === "⌫" ? "حذف آخر رقم" : key}
            onClick={() => {
              setPhone((current) => {
                if (key === "⌫") return current.slice(0, -1);
                if (key === "+") return current ? current : "+";
                return current.length < 40 ? current + key : current;
              });
              setError(null);
            }}
            className="rounded-xl border border-border bg-input py-3 text-lg font-semibold hover:bg-muted disabled:opacity-40"
          >
            {key}
          </button>
        ))}
      </div>
      {currentContacts && !currentContacts.failed && (
        <div className="mt-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={contactName}
              maxLength={80}
              disabled={disabled || savingContact}
              aria-label="اسم جهة الاتصال"
              placeholder="اسم جهة الاتصال"
              onChange={(event) => {
                setContactName(event.target.value);
                setContactMessage("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.preventDefault();
              }}
              className="min-w-0 flex-1 rounded-xl border border-border bg-input px-3 py-2"
            />
            <button
              type="button"
              disabled={disabled || savingContact || !contactName.trim() || !phone.trim()}
              onClick={() => void saveCurrentPhone()}
              className="shrink-0 rounded-xl border border-border px-3 py-2 font-semibold disabled:opacity-40"
            >
              {savingContact ? "جارٍ الحفظ…" : "حفظ الرقم"}
            </button>
          </div>
          {contactMessage && (
            <p role="status" className="mt-2 text-sm">{contactMessage}</p>
          )}
        </div>
      )}
      {error && (
        <p id="pstn-phone-error" role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}