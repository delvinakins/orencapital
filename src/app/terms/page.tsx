// src/app/terms/page.tsx

type Section = { id: string; title: string; content: React.ReactNode };

import React from "react";

const sections: Section[] = [
  {
    id: "not-advice",
    title: "1. Not Investment Advice",
    content: (
      <>
        <p>
          Oren Capital provides risk analytics, statistical modeling tools, and educational
          content for informational purposes only. Nothing on this platform constitutes
          investment advice, trading recommendations, brokerage services, financial planning,
          or fund management of any kind.
        </p>
        <p>
          All trading and investment decisions are solely your responsibility. You should
          consult a licensed financial advisor before making any investment decisions.
        </p>
      </>
    ),
  },
  {
    id: "risk",
    title: "2. Risk Disclosure",
    content: (
      <p>
        Trading and investing involve substantial risk of loss. You may lose all or more than
        your invested capital. Leveraged products can result in losses exceeding your initial
        deposit. Past performance does not guarantee future results. The tools and models
        provided on this platform are probabilistic in nature and do not predict outcomes.
      </p>
    ),
  },
  {
    id: "no-guarantee",
    title: "3. No Guarantee of Results",
    content: (
      <p>
        We do not guarantee profitability, accuracy of projections, risk reduction, or any
        particular outcome. Risk scores, survivability estimates, and kill switch states are
        analytical tools only — they do not constitute advice and do not guarantee capital
        preservation. Use the platform at your own risk.
      </p>
    ),
  },
  {
    id: "account",
    title: "4. Account Responsibilities",
    content: (
      <p>
        You are responsible for maintaining the confidentiality of your account credentials
        and for all activities that occur under your account. You agree to notify us
        immediately of any unauthorized use. You must be at least 18 years old to use this
        platform.
      </p>
    ),
  },
  {
    id: "billing",
    title: "5. Subscription & Billing",
    content: (
      <>
        <p>
          Pro subscriptions are billed in advance on a recurring monthly or annual basis. By
          subscribing, you authorize Oren Analytics LLC to charge your payment method on a
          recurring basis until you cancel. You may cancel at any time through your account
          settings or by contacting support.
        </p>
        <p>
          We may suspend or terminate access for failed payments. Refunds are handled on a
          case-by-case basis at our discretion.
        </p>
      </>
    ),
  },
  {
    id: "kill-switch",
    title: "6. Account Kill Switch",
    content: (
      <p>
        The Account Kill Switch is an advisory tool only. It may restrict recommended risk
        levels based on configurable thresholds. It does not execute trades, connect to
        brokerage accounts, or guarantee capital preservation. Oren Analytics LLC is not
        liable for any losses resulting from following or ignoring kill switch recommendations.
      </p>
    ),
  },
  {
    id: "ip",
    title: "7. Intellectual Property",
    content: (
      <p>
        All content, models, scoring methodologies, code, and design on this platform are the
        intellectual property of Oren Analytics LLC. You may not copy, reproduce, or
        redistribute any portion of the platform without express written permission.
      </p>
    ),
  },
  {
    id: "liability",
    title: "8. Limitation of Liability",
    content: (
      <p>
        To the maximum extent permitted by applicable law, Oren Analytics LLC and its
        officers, employees, and agents shall not be liable for any trading losses, lost
        profits, loss of data, or indirect, incidental, special, or consequential damages
        arising from your use of the platform. Our total liability to you for any claim shall
        not exceed the amount paid by you to Oren Analytics LLC in the three months preceding
        the claim.
      </p>
    ),
  },
  {
    id: "warranties",
    title: "9. Disclaimer of Warranties",
    content: (
      <p>
        The platform is provided "as is" and "as available" without warranties of any kind,
        express or implied. We do not warrant that the platform will be uninterrupted,
        error-free, or free of viruses or other harmful components.
      </p>
    ),
  },
  {
    id: "arbitration",
    title: "10. Arbitration & Dispute Resolution",
    content: (
      <p>
        Any dispute arising out of or relating to these Terms or your use of the platform
        shall be resolved by binding individual arbitration in the State of California under
        the rules of the American Arbitration Association. You waive any right to participate
        in class action lawsuits or class-wide arbitration.
      </p>
    ),
  },
  {
    id: "law",
    title: "11. Governing Law",
    content: (
      <p>
        These Terms are governed by the laws of the State of California, without regard to
        its conflict of law provisions.
      </p>
    ),
  },
  {
    id: "changes",
    title: "12. Changes to These Terms",
    content: (
      <p>
        We may update these Terms at any time. We will notify users of material changes by
        updating the effective date above. Continued use of the platform after changes
        constitutes your acceptance of the revised Terms.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-16 sm:py-24">

        {/* Header */}
        <div className="mb-12 border-b border-[color:var(--border)] pb-10">
          <div className="text-xs tracking-[0.22em] text-foreground/40 mb-4">LEGAL</div>
          <h1 className="text-4xl font-semibold tracking-tight mb-3">Terms of Use</h1>
          <p className="text-sm text-foreground/50">Effective Date: March 1, 2026</p>
          <p className="mt-4 text-sm text-foreground/70 max-w-2xl leading-relaxed">
            Oren Capital is operated by <span className="text-foreground">Oren Analytics LLC</span>{" "}
            ("Company," "we," "us," or "our"), a limited liability company registered in the
            State of California. By accessing or using this platform, you agree to these Terms
            of Use. If you do not agree, do not use the platform.
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-0">
          {sections.map((s, i) => (
            <div
              key={s.id}
              className="group grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-4 sm:gap-10 py-8 border-b border-[color:var(--border)] last:border-0"
            >
              <div className="pt-0.5">
                <span className="text-xs font-semibold tracking-wide text-foreground/40 uppercase">
                  {s.title}
                </span>
              </div>
              <div className="text-sm text-foreground/70 leading-relaxed space-y-3">
                {s.content}
              </div>
            </div>
          ))}
        </div>

        {/* Contact footer */}
        <div className="mt-12 rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-foreground mb-1">Questions about these Terms?</div>
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