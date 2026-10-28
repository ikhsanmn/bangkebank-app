"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export function RevokeKeyButton({ slug, keyId, name }: { slug: string; keyId: string; name: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onRevoke() {
    if (!window.confirm(`Revoke "${name}"? Requests using it will fail immediately. This can't be undone.`)) {
      return;
    }
    setPending(true);
    try {
      const response = await fetch(`/api/console/${slug}/keys/${keyId}/revoke`, { method: "POST" });
      if (!response.ok) {
        window.alert("The key could not be revoked. Refresh and try again.");
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={onRevoke} disabled={pending}>
      {pending ? "Revoking…" : "Revoke"}
    </Button>
  );
}
