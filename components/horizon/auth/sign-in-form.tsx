"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { type FormEvent, useState, useTransition } from "react";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignInForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("avery@bangkebank.app");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const { error: authError } = await authClient.signIn.email({
        email,
        password
      });

      if (authError) {
        setError(authError.message ?? "Unable to sign in.");
        return;
      }

      router.push("/");
      router.refresh();
    });
  }

  return (
    <Card className="border-0 bg-white shadow-sm">
      <CardContent className="space-y-6 p-6 sm:p-8">
        <div className="rounded-[24px] border border-[#b6d4d2] bg-[#eef8f7] p-4 text-sm text-[#24556a]">
          <div className="flex items-center gap-3">
            <ShieldCheck className="size-4" />
            Better Auth now handles credential sessions on the backend through the App Router auth route.
          </div>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-3">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              placeholder="avery@bangkebank.app"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="password">Password</Label>
              <span className="text-sm text-slate-400">Email + password</span>
            </div>
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {error ? (
            <div className="rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <Button className="w-full" size="lg" disabled={isPending} type="submit">
            {isPending ? "Signing in..." : "Sign in to BangkeBank"}
            <ArrowRight className="size-4" />
          </Button>
        </form>

        <p className="text-center text-sm text-slate-600">
          New here?{" "}
          <Link href="/sign-up" className="font-medium text-[#24556a]">
            Create an account
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
