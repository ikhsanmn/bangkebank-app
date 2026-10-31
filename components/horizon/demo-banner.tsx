// Shown on every screen: this app is a portfolio demo, not a licensed bank.
export function DemoBanner() {
  return (
    <div
      role="note"
      className="bg-[#f1c067] px-4 py-2 text-center text-xs font-medium text-[#3d2a05] sm:text-sm"
    >
      Portfolio demo · Sandbox balances only. BangkeBank is not a bank and no real money moves.
    </div>
  );
}
