import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { bankAccounts, formatCurrency, totalBalance } from "@/lib/mock-data";

export function BalanceRing() {
  const stops = bankAccounts
    .map((account, index) => {
      const previous = bankAccounts
        .slice(0, index)
        .reduce((sum, item) => sum + item.balance, 0);
      const start = (previous / totalBalance) * 360;
      const end = ((previous + account.balance) / totalBalance) * 360;
      const colors = ["#0f4c81", "#2c7a7b", "#c5855f"];

      return `${colors[index]} ${start}deg ${end}deg`;
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
            className="flex size-40 items-center justify-center rounded-full"
            style={{
              background: `conic-gradient(${stops})`
            }}
          >
            <div className="flex size-28 flex-col items-center justify-center rounded-full bg-white">
              <span className="text-xs uppercase tracking-[0.26em] text-slate-500">
                Total
              </span>
              <span className="mt-2 text-xl font-semibold text-[#091c31]">
                {formatCurrency(totalBalance)}
              </span>
            </div>
          </div>
        </div>
        <div className="space-y-4">
          {bankAccounts.map((account, index) => {
            const colors = ["bg-[#0f4c81]", "bg-[#2c7a7b]", "bg-[#c5855f]"];

            return (
              <div key={account.id} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`size-3 rounded-full ${colors[index]}`} />
                  <div>
                    <p className="font-medium text-[#091c31]">{account.name}</p>
                    <p className="text-sm text-slate-500">{account.institution}</p>
                  </div>
                </div>
                <p className="font-medium text-[#091c31]">
                  {formatCurrency(account.balance)}
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
