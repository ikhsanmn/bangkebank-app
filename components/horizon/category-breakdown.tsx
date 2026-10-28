import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/format";

export function CategoryBreakdown({
  categories
}: {
  categories: { label: string; value: number }[];
}) {
  const total = categories.reduce((sum, item) => sum + item.value, 0);

  return (
    <Card className="border-0 bg-white/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-2xl">Top spending categories</CardTitle>
        <p className="text-sm text-slate-500">Last 30 days</p>
      </CardHeader>
      <CardContent className="space-y-5">
        {categories.length === 0 ? (
          <p className="text-sm text-slate-500">No spending in the last 30 days.</p>
        ) : null}
        {categories.map((category) => {
          const share = total > 0 ? (category.value / total) * 100 : 0;

          return (
            <div key={category.label} className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <p className="font-medium text-[#091c31]">{category.label}</p>
                <div className="text-right">
                  <p className="font-medium text-[#091c31]">{formatCurrency(category.value)}</p>
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                    {share.toFixed(0)}%
                  </p>
                </div>
              </div>
              <Progress value={share} className="h-2.5 bg-[#ece7de]" />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
