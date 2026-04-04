import React, { useEffect, useState } from 'react';

const THINKING_STEPS = [
  'Reading your request…',
  'Analysing the site context…',
  'Planning WordPress actions…',
  'Thinking through the best approach…',
  'Preparing the response…',
  'Checking SEO requirements…',
  'Drafting the reply…',
];

export default function TypingIndicator() {
  const [stepIndex, setStepIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  // Cycle through step labels every 2.2 s with a quick fade
  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setStepIndex((i) => (i + 1) % THINKING_STEPS.length);
        setVisible(true);
      }, 300);
    }, 2200);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex justify-start mb-4 gap-3">
      {/* AI avatar */}
      <img src="./collings-logo-solo.png" alt="Collings AI" className="flex-shrink-0 w-8 h-8 rounded-xl shadow-md object-cover" />

      {/* Thinking card */}
      <div className="flex-1 max-w-lg bg-gray-800/80 border border-brand-700/30 rounded-2xl rounded-tl-sm px-4 py-3 shadow-md shadow-brand-900/10">
        {/* Header row */}
        <div className="flex items-center gap-2 mb-3">
          {/* Pulsing brain icon */}
          <div className="relative w-5 h-5 flex-shrink-0">
            <svg className="w-5 h-5 text-brand-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <span className="text-brand-300 text-xs font-semibold tracking-wide uppercase">Thinking</span>

          {/* Animated dots */}
          <div className="flex items-center gap-1 ml-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce"
                style={{ animationDelay: `${i * 180}ms`, animationDuration: '1.1s' }}
              />
            ))}
          </div>
        </div>

        {/* Cycling status line */}
        <p
          className="text-gray-400 text-sm leading-relaxed transition-opacity duration-300"
          style={{ opacity: visible ? 1 : 0 }}
        >
          {THINKING_STEPS[stepIndex]}
        </p>

        {/* Shimmer progress bar */}
        <div className="mt-3 h-1 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              background: 'linear-gradient(90deg, #4f46e5, #7c3aed, #4f46e5)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.8s linear infinite',
              width: '60%',
            }}
          />
        </div>

        <style>{`
          @keyframes shimmer {
            0%   { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}</style>
      </div>
    </div>
  );
}
