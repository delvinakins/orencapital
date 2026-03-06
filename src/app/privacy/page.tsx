// src/app/privacy/page.tsx
import React from "react";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-16 sm:py-24">

        {/* Header */}
        <div className="mb-12 border-b border-[color:var(--border)] pb-10">
          <div className="text-xs tracking-[0.22em] text-foreground/40 mb-4">LEGAL</div>
          <h1 className="text-4xl font-semibold tracking-tight mb-3">Privacy Policy</h1>
          <p className="text-sm text-foreground/50">Effective Date: March 1, 2026</p>
          <p className="mt-4 text-sm text-foreground/70 max-w-2xl leading-relaxed">
            Oren Analytics LLC ("we," "us," or "our") operates Oren Capital at orencapital.com.
            This Privacy Policy explains what information we collect, how we use it, and your
            rights regarding your data.
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-0">

          {/* 1. Information We Collect */}
          <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-4 sm:gap-10 py-8 border-b border-[color:var(--border)]">
            <div className="pt-0.5">
              <span className="text-xs font-semibold tracking-wide text-foreground/40 uppercase">
                1. Information We Collect
              </span>
            </div>
            <div className="text-sm text-foreground/70 leading-relaxed space-y-3">
              <p>We collect the following categories of information:</p>
              <div className="space-y-3">
                {[
                  ["Account information", "Email address, name, and authentication data when you create an account or sign in."],
                  ["Usage data", "Pages visited, features used, and interactions with the platform, collected via server logs and analytics."],
                  ["Journal and trade data", "Trade entries, risk parameters, and other data you voluntarily input into the platform."],
                  ["Subscription and billing information", "Subscription status and payment metadata. We do not store full payment card details — these are handled directly by Stripe."],
                  ["Technical data", "IP address, browser type, device type, and referring URLs collected automatically when you use the platform."],
                ].map(([label, desc]) => (
                  <div key={label} className="flex gap-3">
                    <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--accent)]/50" />
                    <p><span className="text-foreground/90 font-medium">{label}:</span> {desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 2. How We Use Data */}
          <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-4 sm:gap-10 py-8 border-b border-[color:var(--border)]">
            <div className="pt-0.5">
              <span className="text-xs font-semibold tracking-wide text-foreground/40 uppercase">
                2. How We Use Your Data
              </span>
            </div>
            <div className="text-sm text-foreground/70 leading-relaxed">
              <div className="space-y-2">
                {[
                  "To authenticate you and maintain your account",
                  "To provide and improve the platform's features",
                  "To process subscription payments and manage billing",
                  "To detect and prevent fraud and abuse",
                  "To communicate with you about your account or support requests",
                  "To comply with legal obligations",
                ].map((item) => (
                  <div key={item} className="flex gap-3">
                    <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--accent)]/50" />
                    <p>{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 3. Third-Party Services */}
          <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-4 sm:gap-10 py-8 border-b border-[color:var(--border)]">
            <div className="pt-0.5">
              <span className="text-xs font-semibold tracking-wide text-foreground/40 uppercase">
                3. Third-Party Services
              </span>
            </div>
            <div className="text-sm text-foreground/70 leading-relaxed space-y-4">
              <p>
                We use the following third-party service providers to operate the platform.
                Each has its own privacy practices:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  ["Supabase", "Database and authentication infrastructure"],
                  ["Stripe", "Payment processing and subscription management"],
                  ["Vercel", "Hosting and deployment infrastructure"],
                  ["Polygon.io", "Market data provider (no personal data shared)"],
                ].map(([name, desc]) => (
                  <div key={name} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-3">
                    <div className="text-xs font-semibold text-foreground/90 mb-0.5">{name}</div>
                    <div className="text-xs text-foreground/50">{desc}</div>
                  </div>
                ))}
              </div>
              <p>We do not sell your personal data to third parties, and we do not share your data with advertisers.</p>
            </div>
          </div>

          {/* 4. Data Retention */}
          <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-4 sm:gap-10 py-8 border-b border-[color:var(--border)]">
            <div className="pt-0.5">
              <span className="text-xs font-semibold tracking-wide text-foreground/40 uppercase">
                4. Data Retention
              </span>
            </div>
            <div className="text-sm text-foreground/70 leading-relaxed">
              <p>
                We retain your account and usage data for as long as your account is active.
                If you delete your account, we will delete or anonymize your personal data
                within 30 days, except where retention is required by law.
              </p>
            </div>
          </div>

          {/* 5. Security */}
          <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-4 sm:gap-10 py-8 border-b border-[color:var(--border)]">
            <div className="pt-0.5">
              <span className="text-xs font-semibold tracking-wide text-foreground/40 uppercase">
                5. Security
              </span>
            </div>
            <div className="text-sm text-foreground/70 leading-relaxed">
              <p>
                We use industry-standard security measures including encrypted connections (HTTPS),
                secure authentication, and access controls to protect your data. No method of
                transmission over the internet is 100% secure, and we cannot guarantee absolute
                security.
              </p>
            </div>
          </div>

          {/* 6. Your Rights */}
          <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-4 sm:gap-10 py-8 border-b border-[color:var(--border)]">
            <div className="pt-0.5">
              <span className="text-xs font-semibold tracking-wide text-foreground/40 uppercase">
                6. Your Rights
              </span>
            </div>
            <div className="text-sm text-foreground/70 leading-relaxed space-y-3">
              <p>Depending on your location, you may have the right to:</p>
              <div className="space-y-2">
                {[
                  "Access the personal data we hold about you",
                  "Request correction of inaccurate data",
                  "Request deletion of your data",
                  "Object to or restrict certain processing",
                  "Export your data in a portable format",
                ].map((item) => (
                  <div key={item} className="flex gap-3">
                    <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--accent)]/50" />
                    <p>{item}</p>
                  </div>
                ))}
              </div>
              <p>
                To exercise any of these rights, contact us at{" "}
                <a href="mailto:support@orencapital.com" className="text-[color:var(--accent)] hover:underline">
                  support@orencapital.com
                </a>.
              </p>
            </div>
          </div>

          {/* 7. CCPA */}
          <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-4 sm:gap-10 py-8 border-b border-[color:var(--border)]">
            <div className="pt-0.5">
              <span className="text-xs font-semibold tracking-wide text-foreground/40 uppercase">
                7. California Privacy Rights (CCPA)
              </span>
            </div>
            <div className="text-sm text-foreground/70 leading-relaxed">
              <p>
                If you are a California resident, you have additional rights under the California
                Consumer Privacy Act, including the right to know what personal information we
                collect and the right to request deletion. We do not sell personal information.
                To submit a CCPA request, contact us at{" "}
                <a href="mailto:support@orencapital.com" className="text-[color:var(--accent)] hover:underline">
                  support@orencapital.com
                </a>.
              </p>
            </div>
          </div>

          {/* 8. Cookies */}
          <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-4 sm:gap-10 py-8 border-b border-[color:var(--border)]">
            <div className="pt-0.5">
              <span className="text-xs font-semibold tracking-wide text-foreground/40 uppercase">
                8. Cookies
              </span>
            </div>
            <div className="text-sm text-foreground/70 leading-relaxed">
              <p>
                We use cookies and similar technologies for authentication and session management.
                We do not use cookies for advertising or cross-site tracking.
              </p>
            </div>
          </div>

          {/* 9. Changes */}
          <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-4 sm:gap-10 py-8">
            <div className="pt-0.5">
              <span className="text-xs font-semibold tracking-wide text-foreground/40 uppercase">
                9. Changes to This Policy
              </span>
            </div>
            <div className="text-sm text-foreground/70 leading-relaxed">
              <p>
                We may update this Privacy Policy from time to time. We will notify users of
                material changes by updating the effective date above. Continued use of the
                platform after changes constitutes acceptance of the revised policy.
              </p>
            </div>
          </div>

        </div>

        {/* Contact footer */}
        <div className="mt-12 rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-foreground mb-1">Questions about your data?</div>
            <div className="text-xs text-foreground/50">Oren Analytics LLC · California, United States</div>
          </div>
          <a
            href="mailto:support@orencapital.com"
            className="oc-btn oc-btn-primary text-sm shrink-0"
          >
            Contact Support
          </a>
        </div>

      </div>
    </main>
  );
}