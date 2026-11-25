"use client";

import { useEffect, useState } from "react";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { fetchGroupMedia } from "@/lib/api-client";
import { hueFromString } from "@/lib/connect/data";
import { Avatar } from "./ui";

export function GroupAvatar({ name, groupId, photoId, size }: {
  name: string; groupId: string; photoId?: string | null; size: number;
}) {
  const { sessionToken } = usePiAuth();
  const [image, setImage] = useState<{ key: string; url: string } | null>(null);
  const key = sessionToken && photoId ? groupId + ":" + photoId : null;

  useEffect(() => {
    setImage(null);
    if (!sessionToken || !photoId || !key) return;
    const scope = new AbortController();
    let url: string | undefined;
    void fetchGroupMedia(sessionToken, groupId, photoId, "image", scope.signal).then(blob => {
      if (scope.signal.aborted) return;
      url = URL.createObjectURL(blob);
      setImage({ key, url });
    }).catch(() => {});
    return () => {
      scope.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [sessionToken, groupId, photoId, key]);

  if (image && image.key === key) {
    return <img src={image.url} alt="" className="shrink-0 rounded-full object-cover" width={size} height={size}
      style={{ width: size, height: size }} onError={() => setImage(null)} />;
  }
  return <Avatar name={name} color={hueFromString(groupId)} size={size} />;
}
