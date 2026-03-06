// src/app/risk-disclosure/page.tsx
export default function RiskDisclosurePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-16 sm:py-24">

        {/* Header */}
        <div className="mb-12 border-b border-[color:var(--border)] pb-10">
          <div className="text-xs tracking-[0.22em] text-foreground/40 mb-4">LEGAL</div>
          <h1 className="text-4xl font-semibold tracking-tight mb-3">Risk Disclosure</h1>
          <p className="text-sm text-foreground/50">Effective Date: March 1, 2026</p>
          <p className="mt-4 text-sm text-foreground/70 max-w-2xl leading-relaxed">
            Please read this disclosure carefully before using Oren Capital. By accessing or
            using the platform, you acknowledge that you have read and understood the risks
            described below.
          </p>
        </div>

        {/* Disclosure blocks */}
        <div className="space-y-0">

          <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-4 sm:gap-10 py-8 border-b border-[color:var(--border)]">
            <div className="pt-0.5">
              <span className="text-xs font-semibold tracking-wide text-foreground/40 uppercase">
                Substantial Risk of Loss
              </span>
            </div>
            <div className="text-sm text-foreground/70 leading-relaxed space-y-3">
              <p>
                Trading and investing in financial instruments — including equities, options,
                futures, leveraged products, and derivatives — involves substantial risk of
                loss. You may lose all or more than your initial investment. Leveraged
                products can result in losses that exceed your deposited capital.
              </p>
              <p>
                Past performance of any trading system, strategy, or model is not indicative
                of future results.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-4 sm:gap-10 py-8 border-b border-[color:var(--border)]">
            <div className="pt-0.5">
              <span className="text-xs font-semibold tracking-wide text-foreground/40 uppercase">
                Models Are Probabilistic
              </span>
            </div>
            <div className="text-sm text-foreground/70 leading-relaxed space-y-3">
              <p>
                All model outputs, probability simulations, risk scores, survivability
                estimates, and kill switch states on this platform are based on mathematical
                assumptions and historical data. They are probabilistic tools, not predictions.
              </p>
              <p>
                Real-world outcomes may differ materially from model outputs. No model can
                account for all market conditions, black swan events, or regime changes.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-4 sm:gap-10 py-8 border-b border-[color:var(--border)]">
            <div className="pt-0.5">
              <span className="text-xs font-semibold tracking-wide text-foreground/40 uppercase">
                Not Investment Advice
              </span>
            </div>
            <div className="text-sm text-foreground/70 leading-relaxed">
              <p>
                Oren Capital and Oren Analytics LLC do not provide investment advice,
                financial planning services, brokerage services, or trading recommendations.
                Nothing on this platform should be construed as advice to buy, sell, or hold
                any financial instrument. All decisions are solely yours.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-4 sm:gap-10 py-8 border-b border-[color:var(--border)]">
            <div className="pt-0.5">
              <span className="text-xs font-semibold tracking-wide text-foreground/40 uppercase">
                Sports & Alternative Markets
              </span>
            </div>
            <div className="text-sm text-foreground/70 leading-relaxed">
              <p>
                Bankroll management tools and probability models applicable to sports wagering
                and prediction markets carry the same risk characteristics as financial trading.
                Outcomes are uncertain. Models do not guarantee results. Responsible use and
                compliance with all applicable local laws is your responsibility.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-4 sm:gap-10 py-8 border-b border-[color:var(--border)]">
            <div className="pt-0.5">
              <span className="text-xs font-semibold tracking-wide text-foreground/40 uppercase">
                Sole Responsibility
              </span>
            </div>
            <div className="text-sm text-foreground/70 leading-relaxed">
              <p>
                You are solely responsible for all trading, investment, and financial
                decisions made using information from this platform. You should consult with
                a qualified financial advisor, accountant, or legal counsel before making any
                financial decisions.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-4 sm:gap-10 py-8">
            <div className="pt-0.5">
              <span className="text-xs font-semibold tracking-wide text-foreground/40 uppercase">
                No Liability
              </span>
            </div>
            <div className="text-sm text-foreground/70 leading-relaxed">
              <p>
                Oren Analytics LLC shall not be liable for any trading losses, lost profits,
                or damages of any kind arising from your use of this platform or reliance on
                any information, model, or tool provided herein. See our{" "}
                <a href="/terms" className="text-[color:var(--accent)] hover:underline">Terms of Use</a>{" "}
                for the full limitation of liability.
              </p>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="mt-12 rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-foreground mb-1">Questions about this disclosure?</div>
            <div className="text-xs text-foreground/50">Oren Analytics LLC · California, United States</div>
          </div>
          <a
            href="mailto:hq@orencapital.com"
            className="oc-btn oc-btn-primary text-sm shrink-0"
          >
            Contact Support
          </a>
        </div>

      </div>
    </main>
  );
}