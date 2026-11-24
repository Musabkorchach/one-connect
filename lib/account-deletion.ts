export type DeletionIssue = "expired" | "limited" | "verification" | "failed" | "uncertain";

export class DeletionRequestError extends Error {
  constructor(public readonly issue: DeletionIssue) {
    super(issue);
  }
}

type Challenge = { confirmationToken: string; expiresAt: number };
type Confirmation = { confirmationToken: string; accessToken: string; confirm: true };
type Pending = { body: Confirmation; receiptDeadline: number };
export type DeletionView = {
  phase: "idle" | "preparing" | "sending" | "issue";
  issue?: DeletionIssue;
  canRetry: boolean;
};

export async function postDeletionRequest(
  url: string, sessionToken: string, body: object, signal: AbortSignal, confirmation = false,
): Promise<Response> {
  signal.throwIfAborted();
  const request = new AbortController();
  const abort = () => request.abort();
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 8_000);
  try {
    const response = await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: { Authorization: `Bearer ${sessionToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: request.signal,
    });
    if (response.ok) return response;
    const code = (await response.json().catch(() => null))?.code;
    if (response.status === 429) throw new DeletionRequestError("limited");
    if (code === "DELETION_CONFIRMATION_INVALID") throw new DeletionRequestError("expired");
    if (["PI_VERIFICATION_FAILED", "PI_IDENTITY_MISMATCH", "PI_VERIFICATION_UNAVAILABLE"].includes(code)) {
      throw new DeletionRequestError("verification");
    }
    throw new DeletionRequestError(confirmation && response.status >= 500 ? "uncertain" : "failed");
  } catch (error) {
    if (error instanceof DeletionRequestError) throw error;
    throw new DeletionRequestError(confirmation ? "uncertain" : "failed");
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}

export function createDeletionFlow({
  getPiToken, challenge, confirm, isCurrent, onChange, onAccepted, now = Date.now,
}: {
  getPiToken: (signal: AbortSignal) => Promise<string>;
  challenge: (signal: AbortSignal) => Promise<Challenge>;
  confirm: (body: Confirmation, signal: AbortSignal) => Promise<void>;
  isCurrent: () => boolean;
  onChange: (state: DeletionView) => void;
  onAccepted: () => void;
  now?: () => number;
}) {
  let task: AbortController | null = null;
  let pending: Pending | null = null;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  let view: DeletionView = { phase: "idle", canRetry: false };
  let closed = false;

  const current = (run: AbortController) => !closed && isCurrent() && task === run && !run.signal.aborted;
  function publish(phase: DeletionView["phase"], issue?: DeletionIssue) {
    view = { phase, issue, canRetry: pending !== null };
    onChange(view);
  }

  function clearPending() {
    clearTimeout(expiry);
    pending = null;
  }

  async function deliver(run: AbortController, attempt: Pending, recovering: boolean) {
    publish("sending");
    for (let pass = 0; pass < 2; pass++) {
      try {
        await confirm(attempt.body, run.signal);
        if (!current(run)) return;
        clearPending();
        onAccepted();
        return;
      } catch (error) {
        if (!current(run)) return;
        const issue = error instanceof DeletionRequestError ? error.issue : "uncertain";
        const uncertain = recovering || issue === "uncertain";
        if (!uncertain) {
          clearPending();
          publish("issue", issue);
          return;
        }
        recovering = true;
        if (now() >= attempt.receiptDeadline) clearPending();
        if (pass === 0 && issue === "uncertain" && pending) continue;
        publish("issue", "uncertain");
        return;
      }
    }
  }

  async function submit(acknowledged: boolean) {
    if (!acknowledged || closed || !isCurrent() || task || pending || view.issue === "uncertain") return;
    const run = new AbortController();
    task = run;
    publish("preparing");
    try {
      const accessToken = await getPiToken(run.signal).catch(() => { throw new DeletionRequestError("verification"); });
      if (!current(run)) return;
      const grant = await challenge(run.signal);
      if (!current(run)) return;
      if (grant.expiresAt <= now()) throw new DeletionRequestError("expired");

      // The receipt remains replayable for ten minutes from acceptance, even after the challenge expires.
      const attempt = { body: { confirmationToken: grant.confirmationToken, accessToken, confirm: true as const },
        receiptDeadline: now() + 10 * 60_000 };
      pending = attempt;
      expiry = setTimeout(() => {
        clearPending();
        if (!closed && isCurrent() && view.phase === "issue") publish("issue", "uncertain");
      }, 10 * 60_000);
      await deliver(run, attempt, false);
    } catch (error) {
      if (current(run)) publish("issue", error instanceof DeletionRequestError ? error.issue : "failed");
    } finally {
      if (task === run) task = null;
    }
  }

  async function retry() {
    if (closed || !isCurrent() || task || !pending) return;
    if (now() >= pending.receiptDeadline) {
      clearPending();
      publish("issue", "uncertain");
      return;
    }
    const run = new AbortController();
    task = run;
    try {
      await deliver(run, pending, true);
    } finally {
      if (task === run) task = null;
    }
  }

  function cancel() {
    if (view.phase === "sending") return false;
    if (pending || view.issue === "uncertain") return true;
    task?.abort();
    task = null;
    publish("idle");
    return true;
  }

  function dispose() {
    closed = true;
    task?.abort();
    task = null;
    clearPending();
  }

  return { submit, retry, cancel, dispose };
}

export async function requestDeletionChallenge(apiUrl: string, sessionToken: string, signal: AbortSignal) {
  const response = await postDeletionRequest(`${apiUrl}/api/account/deletion/challenge`, sessionToken, {}, signal);
  const grant = await response.json();
  const expiresAt = typeof grant?.expiresAt === "string" ? Date.parse(grant.expiresAt) : NaN;
  if (response.status !== 201 || typeof grant?.confirmationToken !== "string" ||
      !/^[a-f0-9]{64}$/.test(grant.confirmationToken) || !Number.isFinite(expiresAt)) {
    throw new DeletionRequestError("failed");
  }
  return { confirmationToken: grant.confirmationToken, expiresAt };
}

export async function confirmAccountDeletion(
  apiUrl: string, sessionToken: string, body: { confirmationToken: string; accessToken: string; confirm: true }, signal: AbortSignal,
) {
  const response = await postDeletionRequest(`${apiUrl}/api/account/deletion/confirm`, sessionToken, body, signal, true);
  if (response.status !== 202) throw new DeletionRequestError("uncertain");
}
