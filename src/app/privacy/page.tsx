// src/app/privacy/page.tsx
export default function PrivacyPage() {
  return (
    <main className="max-w-4xl mx-auto px-6 py-16 prose prose-invert">
      <h1>Privacy Policy</h1>
      <p>Effective Date: March 2026</p>

      <h2>Information We Collect</h2>
      <ul>
        <li>Email address</li>
        <li>Account data</li>
        <li>Usage analytics</li>
        <li>Subscription information</li>
      </ul>

      <h2>How We Use Data</h2>
      <ul>
        <li>Authentication</li>
        <li>Subscription processing</li>
        <li>Platform improvements</li>
        <li>Fraud prevention</li>
      </ul>

      <h2>Third-Party Services</h2>
      <p>
        We use infrastructure providers including Supabase, Stripe, and
        Vercel.
      </p>

      <h2>Data Retention</h2>
      <p>
        We retain data while your account is active or as required by law.
      </p>

      <h2>Your Rights</h2>
      <p>
        You may request access, correction, or deletion of your personal data.
      </p>

      <p>
        Contact: support@orencapital.com
      </p>
    </main>
  );
}