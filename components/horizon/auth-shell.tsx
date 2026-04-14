import type { ReactNode } from "react";

export function AuthShell({
  eyebrow,
  title,
  description,
  children
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
      <section className="relative overflow-hidden bg-[#071421] px-6 py-10 text-white sm:px-10 lg:px-14 lg:py-14">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(106,180,176,0.36),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(237,189,97,0.24),transparent_28%)]" />
        <div
          className="absolute inset-0 bg-grid-fade opacity-30"
          style={{ backgroundSize: "100% 100%, 36px 36px, 36px 36px" }}
        />
        <div className="relative flex h-full flex-col justify-between">
          <div className="space-y-6">
            <p className="text-sm uppercase tracking-[0.34em] text-white/60">{eyebrow}</p>
            <div className="max-w-xl space-y-5">
              <h1 className="font-serif text-4xl leading-tight sm:text-5xl">
                Financial clarity built around every account you already use.
              </h1>
              <p className="max-w-lg text-base leading-7 text-white/70">
                BangkeBank pulls together multi-bank balances, transaction history,
                and ACH transfers into one calm control room for personal money
                management.
              </p>
            </div>
          </div>

          <div className="grid gap-4 rounded-[32px] border border-white/10 bg-white/5 p-6 backdrop-blur md:grid-cols-3">
            <div>
              <p className="text-3xl font-semibold">$46.0K</p>
              <p className="mt-2 text-sm text-white/65">Combined balance view</p>
            </div>
            <div>
              <p className="text-3xl font-semibold">3 banks</p>
              <p className="mt-2 text-sm text-white/65">Connected in one workspace</p>
            </div>
            <div>
              <p className="text-3xl font-semibold">ACH ready</p>
              <p className="mt-2 text-sm text-white/65">Transfer with shareable account IDs</p>
            </div>
          </div>
        </div>
      </section>

      <section className="flex items-center bg-[#f6f1e8] px-6 py-10 sm:px-10 lg:px-14">
        <div className="mx-auto w-full max-w-xl">
          <div className="mb-8 space-y-3">
            <p className="text-sm uppercase tracking-[0.32em] text-[#24556a]">{eyebrow}</p>
            <h2 className="font-serif text-4xl text-[#091c31]">{title}</h2>
            <p className="max-w-lg text-sm leading-7 text-slate-600">{description}</p>
          </div>
          {children}
        </div>
      </section>
    </div>
  );
}
