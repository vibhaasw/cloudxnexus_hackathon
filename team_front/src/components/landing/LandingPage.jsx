// =============================================================
// LandingPage — Complete front door for Smart Warehouse
// Assembles all 10 sections in order:
// 1. LandingNav (Top bar with sticky shrink and dropdown)
// 2. Hero (Live feed prompt box + quick cards)
// 3. Strip (Marquee of capabilities)
// 4. MiniBelt (Interactive "See it in action" canvas)
// 5. WhyUs ("What makes this different" 2-col comparison)
// 6. WhoItsFor (Small shops, Distributors, Grocery, Pharmacies)
// 7. HowItWorks (4 connected steps)
// 8. DashboardPreview (Framed screenshot-like live view)
// 9. TeamAndTech (Team Hyxon & hardware stack)
// 10. Faq (6-question accordion)
// 11. Footer (Closing CTA + footer columns)
// =============================================================

import { useEffect } from 'react';
import '../../landing.css';
import { LandingNav } from './LandingNav';
import { Hero } from './Hero';
import { Strip } from './Strip';
import { MiniBelt } from './MiniBelt';
import { WhyUs } from './WhyUs';
import { WhoItsFor } from './WhoItsFor';
import { HowItWorks } from './HowItWorks';
import { DashboardPreview } from './DashboardPreview';
import { TeamAndTech } from './TeamAndTech';
import { Faq } from './Faq';
import { Footer } from './Footer';

export function LandingPage({ onOpenDashboard, onNavigateTab }) {
  useEffect(() => {
    document.title = 'Smart Warehouse · Every parcel, accounted for.';
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="landing-root">
      {/* 1. Top Navigation Bar */}
      <LandingNav onOpenDashboard={onOpenDashboard} />

      <main>
        {/* 2. Hero Section */}
        <Hero
          onOpenDashboard={onOpenDashboard}
          onNavigateTab={onNavigateTab}
        />

        {/* 3. Strip (Marquee) */}
        <Strip />

        {/* 4. See It In Action (Mini Belt Demo) */}
        <MiniBelt />

        {/* 5. Why Us (Comparison Table) */}
        <WhyUs />

        {/* 6. Who It's For (Audience Tabs) */}
        <WhoItsFor />

        {/* 7. How It Works (4 Steps) */}
        <HowItWorks />

        {/* 8. Dashboard Preview */}
        <DashboardPreview onOpenDashboard={onOpenDashboard} />

        {/* 9. Team & Tech (Team Hyxon) */}
        <TeamAndTech />

        {/* 10. Frequently Asked Questions */}
        <Faq />
      </main>

      {/* 11. Final Call To Action & Footer */}
      <Footer
        onOpenDashboard={onOpenDashboard}
        onNavigateTab={onNavigateTab}
      />
    </div>
  );
}
