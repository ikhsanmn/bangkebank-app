"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { type FormEvent, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MAX_TRANSFER_RUPIAH, formatCurrency, parseRupiah } from "@/lib/format";

export type BankOption = {
  id: string;
  name: string;
  institution: string;
  availableBalance: number;
};

type FormState = {
  senderBankAccountId: string;
  amount: string;
  recipientEmail: string;
  recipientShareableId: string;
  note: string;
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

type Receipt = {
  id: string;
  amount: number;
  recipientName: string;
  status: "pending" | "settled" | "failed";
  failureReason: string | null;
  completedAt: string | null;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(form: FormState, bank: BankOption | undefined): FieldErrors {
  const errors: FieldErrors = {};
  const amount = parseRupiah(form.amount);

  if (!bank) {
    errors.senderBankAccountId = "Choose an account to send from.";
  }
  if (amount === null || amount <= 0) {
    errors.amount = "Enter a whole rupiah amount, e.g. 150000 or 150.000.";
  } else if (amount > MAX_TRANSFER_RUPIAH) {
    errors.amount = `A single transfer is limited to ${formatCurrency(MAX_TRANSFER_RUPIAH)}.`;
  } else if (bank && amount > bank.availableBalance) {
    errors.amount = `Amount exceeds the ${formatCurrency(bank.availableBalance)} available.`;
  }
  if (!EMAIL_PATTERN.test(form.recipientEmail.trim())) {
    errors.recipientEmail = "Enter the recipient's email address.";
  }
  if (form.recipientShareableId.trim().length < 6) {
    errors.recipientShareableId = "Enter the recipient's shareable ID (e.g. BB-1A2B3C4D).";
  }
  return errors;
}

export function TransferForm({ banks }: { banks: BankOption[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>({
    senderBankAccountId: banks[0]?.id ?? "",
    amount: "",
    recipientEmail: "",
    recipientShareableId: "",
    note: ""
  });
  const [step, setStep] = useState<"details" | "review">("details");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  // One key per reviewed transfer: a double click or retry of the same
  // submission can't move money twice.
  const [idempotencyKey, setIdempotencyKey] = useState("");

  const bank = banks.find((option) => option.id === form.senderBankAccountId);

  function updateField<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  }

  function handleReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const errors = validate(form, bank);
    setFieldErrors(errors);
    if (Object.keys(errors).length === 0) {
      setIdempotencyKey(crypto.randomUUID());
      setStep("review");
    }
  }

  function handleConfirm() {
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/transfers", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey
          },
          credentials: "include",
          body: JSON.stringify({
            senderBankAccountId: form.senderBankAccountId,
            recipientEmail: form.recipientEmail.trim(),
            recipientShareableId: form.recipientShareableId.trim(),
            amount: parseRupiah(form.amount),
            note: form.note.trim() || undefined
          })
        });

        const payload = (await response.json()) as {
          transfer?: Receipt;
          error?: string;
        };

        if (!response.ok || payload.transfer?.status !== "settled") {
          setStep("details");
          setError(payload.error ?? "The transfer could not be completed.");
          return;
        }

        setReceipt(payload.transfer);
        router.refresh();
      } catch {
        setError("Network error. Your transfer was not confirmed; check History before retrying.");
      }
    });
  }

  function startOver() {
    setReceipt(null);
    setStep("details");
    setForm((current) => ({
      ...current,
      amount: "",
      recipientEmail: "",
      recipientShareableId: "",
      note: ""
    }));
  }

  if (banks.length === 0) {
    return (
      <Card className="border-0 bg-white/80 shadow-sm">
        <CardContent className="p-6 text-sm text-slate-500">
          You need an account before you can send a transfer.
        </CardContent>
      </Card>
    );
  }

  if (receipt) {
    return (
      <Card className="border-0 bg-white/80 shadow-sm">
        <CardContent className="space-y-5 p-6" role="status" aria-live="polite">
          <div className="flex items-center gap-3 text-emerald-700">
            <CheckCircle2 className="size-6" aria-hidden />
            <p className="text-xl font-semibold">Transfer sent</p>
          </div>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Amount</dt>
              <dd className="font-medium text-[#091c31]">{formatCurrency(Number(receipt.amount))}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">To</dt>
              <dd className="font-medium text-[#091c31]">{receipt.recipientName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Reference</dt>
              <dd className="font-mono text-xs text-[#091c31]">{receipt.id}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-3">
            <Button onClick={startOver}>Send another</Button>
            <Link
              href="/transaction-history"
              className="inline-flex items-center px-4 text-sm font-medium text-[#24556a] hover:text-[#091c31]"
            >
              View in history
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (step === "review" && bank) {
    return (
      <Card className="border-0 bg-white/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Review transfer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <dl className="space-y-3 rounded-[24px] bg-[#f7f4ef] p-5 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">From</dt>
              <dd className="text-right font-medium text-[#091c31]">
                {bank.name} ({bank.institution})
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">To</dt>
              <dd className="text-right font-medium text-[#091c31]">
                {form.recipientEmail.trim()}
                <span className="block font-mono text-xs text-slate-500">
                  {form.recipientShareableId.trim()}
                </span>
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Amount</dt>
              <dd className="text-lg font-semibold text-[#091c31]">
                {formatCurrency(parseRupiah(form.amount) ?? 0)}
              </dd>
            </div>
            {form.note.trim() ? (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Note</dt>
                <dd className="text-right text-[#091c31]">{form.note.trim()}</dd>
              </div>
            ) : null}
          </dl>
          <p className="text-sm text-slate-500">
            Sandbox transfers settle instantly between demo accounts. No real money moves.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button variant="outline" disabled={isPending} onClick={() => setStep("details")}>
              Back
            </Button>
            <Button className="flex-1" disabled={isPending} onClick={handleConfirm}>
              {isPending ? "Sending..." : `Confirm and send ${formatCurrency(parseRupiah(form.amount) ?? 0)}`}
            </Button>
          </div>
          {error ? (
            <p role="alert" className="rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 bg-white/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-2xl">Transfer details</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={handleReview} noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <Label htmlFor="source-account">From account</Label>
              <Select
                id="source-account"
                value={form.senderBankAccountId}
                onChange={(event) => updateField("senderBankAccountId", event.target.value)}
                aria-describedby={fieldErrors.senderBankAccountId ? "source-account-error" : undefined}
              >
                {banks.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} • {formatCurrency(account.availableBalance)} available
                  </option>
                ))}
              </Select>
              <FieldError id="source-account-error" message={fieldErrors.senderBankAccountId} />
            </div>
            <div className="space-y-3">
              <Label htmlFor="amount">Amount (IDR)</Label>
              <Input
                id="amount"
                inputMode="numeric"
                placeholder="150.000"
                value={form.amount}
                onChange={(event) => updateField("amount", event.target.value)}
                aria-invalid={Boolean(fieldErrors.amount)}
                aria-describedby={fieldErrors.amount ? "amount-error" : undefined}
              />
              <FieldError id="amount-error" message={fieldErrors.amount} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <Label htmlFor="recipient-email">Recipient email</Label>
              <Input
                id="recipient-email"
                type="email"
                autoComplete="off"
                value={form.recipientEmail}
                onChange={(event) => updateField("recipientEmail", event.target.value)}
                aria-invalid={Boolean(fieldErrors.recipientEmail)}
                aria-describedby={fieldErrors.recipientEmail ? "recipient-email-error" : undefined}
              />
              <FieldError id="recipient-email-error" message={fieldErrors.recipientEmail} />
            </div>
            <div className="space-y-3">
              <Label htmlFor="shareable-id">Recipient shareable ID</Label>
              <Input
                id="shareable-id"
                placeholder="BB-1A2B3C4D"
                value={form.recipientShareableId}
                onChange={(event) => updateField("recipientShareableId", event.target.value)}
                aria-invalid={Boolean(fieldErrors.recipientShareableId)}
                aria-describedby={fieldErrors.recipientShareableId ? "shareable-id-error" : undefined}
              />
              <FieldError id="shareable-id-error" message={fieldErrors.recipientShareableId} />
            </div>
          </div>

          <div className="space-y-3">
            <Label htmlFor="memo">Note (optional)</Label>
            <Textarea
              id="memo"
              maxLength={280}
              value={form.note}
              onChange={(event) => updateField("note", event.target.value)}
            />
          </div>

          {error ? (
            <p role="alert" className="rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </p>
          ) : null}

          <Button className="w-full" size="lg" type="submit">
            Review transfer
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-sm text-rose-700">
      {message}
    </p>
  );
}
