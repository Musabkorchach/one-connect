type Stats = Pick<RTCStatsReport, "get" | "forEach">;

function candidateType(value: unknown) {
  return value === "host" || value === "srflx" || value === "prflx" || value === "relay"
    ? value : null;
}

function byteCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function selectIceStatistics(stats: Stats, connectionState: RTCPeerConnectionState) {
  const selected = new Set<string>();
  const nominated = new Set<string>();
  stats.forEach((row, id) => {
    if (row.type === "transport" && typeof row.selectedCandidatePairId === "string") {
      selected.add(row.selectedCandidatePairId);
    }
    if (row.type === "candidate-pair" && row.nominated === true && row.state === "succeeded") {
      nominated.add(id);
    }
  });

  // A nominated pair is only a useful hint when the report is unambiguous.
  const inferred = selected.size === 0;
  const candidates = inferred ? nominated : selected;
  if (candidates.size !== 1 || (inferred && connectionState !== "connected")) return null;
  const [id] = candidates;
  const pair = stats.get(id);
  if (pair?.type !== "candidate-pair") return null;
  const local = stats.get(pair.localCandidateId);
  const remote = stats.get(pair.remoteCandidateId);
  return {
    source: inferred ? "nominated" as const : "selected" as const,
    connectionState,
    local: local?.type === "local-candidate" ? candidateType(local.candidateType) : null,
    remote: remote?.type === "remote-candidate" ? candidateType(remote.candidateType) : null,
    bytesSent: byteCount(pair.bytesSent),
    bytesReceived: byteCount(pair.bytesReceived),
  };
}

export type CallIceStatistics = NonNullable<ReturnType<typeof selectIceStatistics>>;

export async function readIceStatistics(
  peer: Pick<RTCPeerConnection, "getStats" | "connectionState">,
  timeoutMs = 5000,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("ice-statistics-timeout")), timeoutMs);
    });
    const stats = await Promise.race([peer.getStats(), deadline]);
    return selectIceStatistics(stats, peer.connectionState);
  } finally {
    clearTimeout(timer);
  }
}
