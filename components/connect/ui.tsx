import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { initials } from "@/lib/connect/data";

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(" ");
}

type BtnVariant = "primary" | "gold" | "turquoise" | "outline" | "ghost" | "danger" | "success";

const btnStyles: Record<BtnVariant, string> = {
  primary: "bg-primary text-primary-foreground",
  gold: "bg-gold text-gold-foreground",
  turquoise: "bg-turquoise text-turquoise-foreground",
  outline: "border border-border bg-transparent text-foreground",
  ghost: "bg-transparent text-foreground",
  danger: "bg-destructive text-destructive-foreground",
  success: "bg-success text-success-foreground",
};

export function Button({
  variant = "primary",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  return (
    <button
      className={cx(
        "pc-press inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold disabled:opacity-40 disabled:pointer-events-none",
        btnStyles[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function IconButton({
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cx(
        "pc-press inline-flex items-center justify-center rounded-full disabled:opacity-40 disabled:pointer-events-none",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("pc-glass rounded-2xl", className)}>{children}</div>;
}

export function Pill({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold", className)}>
      {children}
    </span>
  );
}

export const inputClass =
  "w-full rounded-xl bg-input/70 border border-border px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors";

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(inputClass, props.className)} {...props} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(inputClass, "resize-none", props.className)} {...props} />;
}

export function Avatar({
  name,
  color,
  src,
  size = 44,
  online,
  className,
}: {
  name: string;
  color: number;
  src?: string | null;
  size?: number;
  online?: boolean;
  className?: string;
}) {
  return (
    <div className={cx("relative shrink-0", className)} style={{ width: size, height: size }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src || "/placeholder.svg"}
          alt=""
          className="h-full w-full rounded-full object-cover"
          crossOrigin="anonymous"
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center rounded-full font-bold text-white"
          style={{
            background: `linear-gradient(135deg, oklch(0.55 0.19 ${color}), oklch(0.45 0.2 ${(color + 40) % 360}))`,
            fontSize: size * 0.38,
          }}
        >
          {initials(name)}
        </div>
      )}
      {online !== undefined && (
        <span
          className={cx(
            "absolute bottom-0 right-0 rounded-full border-2 border-background",
            online ? "bg-success" : "bg-muted-foreground",
          )}
          style={{ width: size * 0.28, height: size * 0.28 }}
        />
      )}
    </div>
  );
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={cx("text-xs font-bold uppercase tracking-wider text-muted-foreground", className)}>
      {children}
    </h2>
  );
}

export function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-16 text-center pc-fade-in">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full pc-glass text-muted-foreground">
        {icon}
      </div>
      <p className="text-base font-semibold text-foreground">{title}</p>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground text-balance">{subtitle}</p>}
    </div>
  );
}

export function Header({
  title,
  right,
  left,
}: {
  title: ReactNode;
  right?: ReactNode;
  left?: ReactNode;
}) {
  return (
    <header className="pc-glass-strong sticky top-0 z-20 pc-safe-top">
      <div className="flex items-center gap-3 px-4 py-3">
        {left}
        <h1 className="flex-1 text-xl font-bold tracking-tight truncate">{title}</h1>
        {right}
      </div>
    </header>
  );
}
