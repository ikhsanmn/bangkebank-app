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
      { key: "firstName", label: "First name", placeholder: "Avery" },
      { key: "lastName", label: "Last name", placeholder: "Brooks" },
      { key: "address1", label: "Address", placeholder: "12 Bedford Ave" },
      { key: "city", label: "City", placeholder: "Brooklyn" },
      { key: "state", label: "State", placeholder: "NY" },
      { key: "postalCode", label: "Postal code", placeholder: "11249" },
      { key: "dateOfBirth", label: "Date of birth", placeholder: "1993-07-15" },
      { key: "ssn", label: "SSN", placeholder: "1234" }
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
        ssnLast4: form.ssn.slice(-4)
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
            Better Auth creates the account and the backend seeds starter bank data in PostgreSQL right after signup.
          </div>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((field) => (
              <div key={field.key} className="space-y-3">
                <Label htmlFor={field.key}>{field.label}</Label>
                <Input
                  id={field.key}
                  placeholder={field.placeholder}
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
                placeholder="avery@bangkebank.app"
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
              />
            </div>
            <div className="space-y-3">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Create a secure password"
                value={form.password}
                onChange={(event) => updateField("password", event.target.value)}
              />
            </div>
          </div>

          {error ? (
            <div className="rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <Button className="w-full" size="lg" disabled={isPending} type="submit">
            {isPending ? "Creating account..." : "Continue to connect bank"}
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
