import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { categoryBreakdown, formatCurrency } from "@/lib/mock-data";

const total = categoryBreakdown.reduce((sum, item) => sum + item.value, 0);

export function CategoryBreakdown() {
  return (
    <Card className="border-0 bg-white/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-2xl">Top categories</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {categoryBreakdown.map((category) => {
          const share = (category.value / total) * 100;

          return (
            <div key={category.label} className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <p className="font-medium text-[#091c31]">{category.label}</p>
                <div className="text-right">
                  <p className="font-medium text-[#091c31]">
                    {formatCurrency(category.value)}
                  </p>
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
