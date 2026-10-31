import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { AccountView } from "@/lib/views";

const RING_COLORS = ["#0f4c81", "#2c7a7b", "#c5855f"];
const DOT_COLORS = ["bg-[#0f4c81]", "bg-[#2c7a7b]", "bg-[#c5855f]"];

export function BalanceRing({ accounts, total }: { accounts: AccountView[]; total: number }) {
  let previous = 0;
  const stops = accounts
    .map((account, index) => {
      const start = total > 0 ? (previous / total) * 360 : 0;
      previous += account.balance;
      const end = total > 0 ? (previous / total) * 360 : 0;
      return `${RING_COLORS[index % RING_COLORS.length]} ${start}deg ${end}deg`;
    })
    .join(", ");

  return (
    <Card className="border-0 bg-white/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-2xl">Balance distribution</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-[220px_1fr] md:items-center">
        <div className="mx-auto flex size-52 items-center justify-center rounded-full bg-[#f5efe4]">
          <div
            className="flex size-40 items-center justify-center rounded-full bg-[#ece7de]"
            style={total > 0 ? { background: `conic-gradient(${stops})` } : undefined}
          >
            <div className="flex size-28 flex-col items-center justify-center rounded-full bg-white">
              <span className="text-xs uppercase tracking-[0.26em] text-slate-500">Total</span>
              <span className="mt-2 text-xl font-semibold text-[#091c31]">
                {formatCurrency(total)}
              </span>
            </div>
          </div>
        </div>
        <div className="space-y-4">
          {accounts.length === 0 ? (
            <p className="text-sm text-slate-500">No accounts yet.</p>
          ) : null}
          {accounts.map((account, index) => (
            <div key={account.id} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`size-3 rounded-full ${DOT_COLORS[index % DOT_COLORS.length]}`} />
                <div>
                  <p className="font-medium text-[#091c31]">{account.name}</p>
                  <p className="text-sm text-slate-500">{account.institution}</p>
                </div>
              </div>
              <p className="font-medium text-[#091c31]">{formatCurrency(account.balance)}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
