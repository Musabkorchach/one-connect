"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#171024",
        color: "#ffffff",
        padding: "24px",
        overflowWrap: "anywhere",
      }}
    >
      <h1>One Connect — Display error</h1>
      <p>Please send a screenshot of this message.</p>

      <pre style={{ whiteSpace: "pre-wrap" }}>
        {error.message || "Unknown error"}
      </pre>

      {error.digest && <p>Reference: {error.digest}</p>}

      <button
        onClick={() => reset()}
        style={{
          marginTop: "20px",
          padding: "12px 20px",
          background: "#ffffff",
          color: "#171024",
          borderRadius: "8px",
        }}
      >
        Try again
      </button>
    </main>
  );
}