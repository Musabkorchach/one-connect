"use client";

import { usePiAuth } from "@/contexts/pi-auth-context";

export function AuthLoadingScreen() {
  const { authMessage, hasError, reinitialize } = usePiAuth();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#0a0410] via-[#1a0a2e] to-[#0f0520]">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 right-20 w-96 h-96 rounded-full blur-3xl animate-pulse" style={{ background: "oklch(0.48 0.21 310 / 0.1)", animationDuration: "4s" }} />
        <div className="absolute bottom-20 left-20 w-96 h-96 rounded-full blur-3xl animate-pulse" style={{ background: "oklch(0.72 0.13 195 / 0.1)", animationDuration: "6s", animationDelay: "1s" }} />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-md w-full px-6 text-center space-y-8">
        {/* Logo */}
        <div className="flex justify-center">
          <div className="relative">
            {/* Glassmorphic background */}
            <div className="w-28 h-28 rounded-3xl backdrop-blur-xl bg-white/5 border border-white/10 flex items-center justify-center shadow-2xl">
              {/* One Connect Logo SVG */}
              <svg className="w-16 h-16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Circle outline in gold */}
                <circle cx="12" cy="12" r="10" stroke="#fbb44a" strokeWidth="1.5" />
                {/* Pi symbol in turquoise */}
                <text x="12" y="14" textAnchor="middle" fontSize="16" fontWeight="bold" fill="#01c0c8" fontFamily="system-ui">
                  π
                </text>
              </svg>
            </div>
            {/* Animated ring */}
            {!hasError && (
              <div className="absolute inset-0 rounded-3xl border-2 border-transparent animate-spin" style={{ borderTopColor: "oklch(0.48 0.21 310)", borderRightColor: "oklch(0.82 0.14 72 / 0.4)", animationDuration: "3s" }} />
            )}
          </div>
        </div>

        {/* Title and Message */}
        <div className="space-y-3">
          <h1 className="text-3xl font-bold bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(to right, oklch(0.82 0.14 72), oklch(0.72 0.13 195), oklch(0.82 0.14 72))" }}>
            One Connect
          </h1>
          <h2 className="text-lg font-semibold text-white/90">
            {hasError ? "Authentication Error" : "Connecting..."}
          </h2>
          <p className={`text-sm leading-relaxed ${hasError ? "text-destructive/80" : "text-white/60"}`}>
            {authMessage}
          </p>
        </div>

        {/* Status indicator */}
        {!hasError && (
          <div className="flex items-center justify-center gap-2 pt-4">
            <div className="flex gap-1">
              <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: "oklch(0.82 0.14 72)", animationDelay: "0s" }} />
              <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: "oklch(0.72 0.13 195)", animationDelay: "0.2s" }} />
              <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: "oklch(0.48 0.21 310)", animationDelay: "0.4s" }} />
            </div>
            <span className="text-xs text-white/50 ml-2">Initializing...</span>
          </div>
        )}

        {/* Error recovery button */}
        {hasError && (
          <button
            onClick={reinitialize}
            className="px-6 py-3 text-white rounded-xl font-semibold transition-all duration-200 shadow-lg"
            style={{ background: "linear-gradient(to right, oklch(0.4 0.18 310), oklch(0.35 0.17 310))" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "linear-gradient(to right, oklch(0.35 0.17 310), oklch(0.3 0.16 310))")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "linear-gradient(to right, oklch(0.4 0.18 310), oklch(0.35 0.17 310))")}
          >
            Retry Authentication
          </button>
        )}

        {/* Footer text */}
        <p className="text-xs text-white/40 pt-2">
          Your Pi username is your universal digital ID
        </p>
      </div>
    </div>
  );
}
