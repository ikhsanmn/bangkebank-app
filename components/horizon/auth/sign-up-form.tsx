"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BadgeCheck } from "lucide-react";
import { type FormEvent, useMemo, useState, useTransition } from "react";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialForm = {
  firstName: "",
  lastName: "",
  address1: "",
  city: "",
  state: "",
  postalCode: "",
  dateOfBirth: "",
  ssn: "",
  email: "",
  password: ""
};

export function SignUpForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState<string | null>(null);

  const fields = useMemo(
    () => [
      { key: "firstName", label: "First name", placeholder: "Avery", autoComplete: "given-name", type: "text" },
      { key: "lastName", label: "Last name", placeholder: "Brooks", autoComplete: "family-name", type: "text" },
      { key: "address1", label: "Address", placeholder: "12 Example St", autoComplete: "address-line1", type: "text" },
      { key: "city", label: "City", placeholder: "Springfield", autoComplete: "address-level2", type: "text" },
      { key: "state", label: "State / province", placeholder: "CA", autoComplete: "address-level1", type: "text" },
      { key: "postalCode", label: "Postal code", placeholder: "12345", autoComplete: "postal-code", type: "text" },
      { key: "dateOfBirth", label: "Date of birth", placeholder: "", autoComplete: "bday", type: "date" },
      { key: "ssn", label: "ID number (last 4 digits)", placeholder: "••••", autoComplete: "off", type: "password" }
    ] as const,
    []
  );

  function updateField(key: keyof typeof initialForm, value: string) {
    setForm((current) => ({
      ...current,
      [key]: value
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const { error: authError } = await authClient.signUp.email({
        email: form.email,
        password: form.password,
        name: `${form.firstName} ${form.lastName}`.trim(),
        firstName: form.firstName,
        lastName: form.lastName,
        address1: form.address1,
        city: form.city,
        state: form.state,
        postalCode: form.postalCode,
        dateOfBirth: form.dateOfBirth,
        ssnLast4: form.ssn.replace(/\D/g, "").slice(-4)
      });

      if (authError) {
        setError(authError.message ?? "Unable to create your account.");
        return;
      }

      router.push("/connect-bank");
      router.refresh();
    });
  }

  return (
    <Card className="border-0 bg-white shadow-sm">
      <CardContent className="space-y-6 p-6 sm:p-8">
        <div className="rounded-[24px] border border-[#ead7b0] bg-[#fff7e8] p-4 text-sm text-[#7a5822]">
          <div className="flex items-center gap-3">
            <BadgeCheck className="size-4" />
            This is a portfolio demo. Use made-up details, not your real identity data.
          </div>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((field) => (
              <div key={field.key} className="space-y-3">
                <Label htmlFor={field.key}>{field.label}</Label>
                <Input
                  id={field.key}
                  type={field.type}
                  required
                  autoComplete={field.autoComplete}
                  placeholder={field.placeholder}
                  {...(field.key === "ssn"
                    ? { inputMode: "numeric" as const, maxLength: 4, pattern: "\\d{4}" }
                    : {})}
                  value={form[field.key]}
                  onChange={(event) => updateField(field.key, event.target.value)}
                />
              </div>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
              />
            </div>
            <div className="space-y-3">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={12}
                autoComplete="new-password"
                aria-describedby="password-hint"
                placeholder="At least 12 characters"
                value={form.password}
                onChange={(event) => updateField("password", event.target.value)}
              />
              <p id="password-hint" className="text-xs text-slate-500">
                Use 12 or more characters.
              </p>
            </div>
          </div>

          {error ? (
            <p role="alert" className="rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </p>
          ) : null}

          <Button className="w-full" size="lg" disabled={isPending} type="submit">
            {isPending ? "Creating account..." : "Create demo account"}
            <ArrowRight className="size-4" />
          </Button>
        </form>

        <p className="text-center text-sm text-slate-600">
          Already registered?{" "}
          <Link href="/sign-in" className="font-medium text-[#24556a]">
            Sign in instead
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
