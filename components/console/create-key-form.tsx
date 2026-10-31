"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { CopyShareableId } from "@/components/horizon/copy-shareable-id";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateKeyForm({ slug, scopes }: { slug: string; scopes: readonly string[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([...scopes]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  function toggle(scope: string) {
    setSelected((current) =>
      current.includes(scope) ? current.filter((value) => value !== scope) : [...current, scope]
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/console/${slug}/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, scopes: selected })
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "The key could not be created.");
        return;
      }
      setToken(payload.token);
      setName("");
      router.refresh();
    } catch {
      setError("Network error. The key may not have been created; refresh to check.");
    } finally {
      setPending(false);
    }
  }

  if (token) {
    return (
      <div className="space-y-3 rounded-[20px] border border-amber-200 bg-amber-50 p-4" role="status">
        <p className="text-sm font-medium text-amber-900">
          Copy this key now. It is shown once and can&apos;t be recovered.
        </p>
        <code className="block break-all rounded-xl bg-white px-3 py-2 text-xs text-slate-800">{token}</code>
        <div className="flex gap-2">
          <CopyShareableId value={token} />
          <Button variant="ghost" size="sm" onClick={() => setToken(null)}>
            I&apos;ve stored it
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="key-name">Key name</Label>
        <Input
          id="key-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Production backend"
          maxLength={100}
          required
        />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Scopes</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {scopes.map((scope) => (
            <label key={scope} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={selected.includes(scope)} onChange={() => toggle(scope)} />
              <code>{scope}</code>
            </label>
          ))}
        </div>
      </fieldset>
      {error ? (
        <p role="alert" className="rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending || selected.length === 0}>
        {pending ? "Creating…" : "Create key"}
      </Button>
    </form>
  );
}
