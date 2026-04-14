"use client";

import { ShieldEllipsis } from "lucide-react";
import { type FormEvent, useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, transferRecipients } from "@/lib/mock-data";

type BankOption = {
  id: string;
  name: string;
  availableBalance: number;
};

type TransferFormState = {
  senderBankAccountId: string;
  amount: string;
  recipientEmail: string;
  recipientShareableId: string;
  note: string;
};

const initialState: TransferFormState = {
  senderBankAccountId: "",
  amount: "",
  recipientEmail: transferRecipients[0].email,
  recipientShareableId: transferRecipients[0].shareableId,
  note: transferRecipients[0].note
};

export function TransferForm() {
  const [banks, setBanks] = useState<BankOption[]>([]);
  const [isLoadingBanks, setIsLoadingBanks] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<TransferFormState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadBanks() {
      setIsLoadingBanks(true);

      try {
        const response = await fetch("/api/banks", {
          credentials: "include"
        });
        const payload = (await response.json()) as { banks?: BankOption[]; error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load bank accounts.");
        }

        if (active) {
          const nextBanks = payload.banks ?? [];
          setBanks(nextBanks);
          setForm((current) => ({
            ...current,
            senderBankAccountId: current.senderBankAccountId || nextBanks[0]?.id || ""
          }));
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load bank accounts."
          );
        }
      } finally {
        if (active) {
          setIsLoadingBanks(false);
        }
      }
    }

    loadBanks();

    return () => {
      active = false;
    };
  }, []);

  function updateField<Key extends keyof TransferFormState>(
    key: Key,
    value: TransferFormState[Key]
  ) {
    setForm((current) => ({
      ...current,
      [key]: value
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/transfers", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          credentials: "include",
          body: JSON.stringify({
            senderBankAccountId: form.senderBankAccountId,
            recipientEmail: form.recipientEmail,
            recipientShareableId: form.recipientShareableId,
            amount: Number(form.amount),
            note: form.note
          })
        });

        const payload = (await response.json()) as {
          transfer?: { amount: number };
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "Transfer request failed.");
        }

        setSuccess(
          `Transfer created for ${formatCurrency(payload.transfer?.amount ?? Number(form.amount))}.`
        );
        setForm((current) => ({
          ...current,
          amount: "",
          note: ""
        }));
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "Transfer request failed."
        );
      }
    });
  }

  return (
    <Card className="border-0 bg-white/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-2xl">Transfer form</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <Label htmlFor="source-account">Source account</Label>
              <Select
                id="source-account"
                disabled={isLoadingBanks || banks.length === 0}
                value={form.senderBankAccountId}
                onChange={(event) => updateField("senderBankAccountId", event.target.value)}
              >
                {banks.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} • {formatCurrency(account.availableBalance)} available
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-3">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                min="0"
                step="0.01"
                type="number"
                placeholder="250.00"
                value={form.amount}
                onChange={(event) => updateField("amount", event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <Label htmlFor="recipient-email">Recipient email</Label>
              <Input
                id="recipient-email"
                type="email"
                value={form.recipientEmail}
                onChange={(event) => updateField("recipientEmail", event.target.value)}
              />
            </div>
            <div className="space-y-3">
              <Label htmlFor="shareable-id">Recipient shareable ID</Label>
              <Input
                id="shareable-id"
                value={form.recipientShareableId}
                onChange={(event) => updateField("recipientShareableId", event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label htmlFor="memo">Transfer note</Label>
            <Textarea
              id="memo"
              value={form.note}
              onChange={(event) => updateField("note", event.target.value)}
            />
          </div>

          <div className="rounded-[28px] border border-[#cce0df] bg-[#eef8f7] p-5">
            <div className="flex items-start gap-3">
              <ShieldEllipsis className="mt-0.5 size-5 text-[#24556a]" />
              <div>
                <p className="font-medium text-[#091c31]">Shareable ID validation</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  This form posts to the new `/api/transfers` route. If the
                  shareable ID matches another BangkeBank account, balances and
                  transaction history are updated in PostgreSQL.
                </p>
              </div>
            </div>
          </div>

          {error ? (
            <div className="rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          {success ? (
            <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {success}
            </div>
          ) : null}

          <Button
            className="w-full"
            size="lg"
            disabled={isPending || isLoadingBanks || banks.length === 0}
            type="submit"
          >
            {isPending ? "Submitting transfer..." : "Submit transfer request"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
