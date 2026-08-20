import React from 'react';
import Head from 'next/head';
import Link from 'next/link';

export default function LandingPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');

          .font-inter {
              font-family: 'Inter', sans-serif;
          }

          .font-space-mono {
              font-family: 'Space Mono', monospace;
          }

          .hero-bg {
              background-image: url('https://otoma8.com/hero-bg.avif?v=1785146068542.9114');
              background-size: cover;
              background-position: center;
              background-repeat: no-repeat;
          }

          @keyframes marquee {
              0% { transform: translate3d(0, 0, 0); }
              100% { transform: translate3d(-50%, 0, 0); }
          }

          .animate-marquee {
              animation: marquee 35s linear infinite;
          }

          .mask-edges {
              mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent);
              -webkit-mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent);
          }

          @media (prefers-reduced-motion: reduce) {
              .animate-marquee {
                  animation: none;
              }
          }
        `
      }} />
      <div className="bg-gray-100 h-screen p-2 md:p-4 flex items-center justify-center font-inter">
          <main className="w-full max-w-[1600px] h-full rounded-[1.5rem] md:rounded-[2rem] overflow-hidden relative shadow-2xl hero-bg flex flex-col justify-between">
              <header className="w-full flex items-center justify-between px-6 md:px-8 py-4 z-10 text-white">
                  <div className="flex items-center gap-2 cursor-pointer" data-purpose="logo">
                      <span className="text-2xl font-semibold tracking-tight">Living Diagnosis</span>
                  </div>
                  <nav className="hidden md:flex items-center gap-8 text-sm font-medium tracking-widest uppercase">
                  </nav>
                  <button className="bg-[#d4ff63] text-black px-6 py-2.5 rounded-full text-sm font-normal font-space-mono tracking-widest uppercase hover:bg-[#c2f04b] transition-colors shadow-sm">
                      Contact Us
                  </button>
              </header>
              <div className="flex flex-col items-center text-center px-4 z-10 mt-4 md:mt-8">
                  <h1 className="text-white text-5xl md:text-7xl font-bold tracking-tight mb-4 leading-tight max-w-4xl mx-auto drop-shadow-md">
                      Building the future with<br />AI and strategy
                  </h1>
                  <p className="text-white text-lg md:text-xl font-medium max-w-2xl mx-auto mb-10 drop-shadow-sm">
                      We help organizations unlock growth and efficiency through data-<br />driven consulting and intelligent
                      automation.
                  </p>
                  <div className="flex items-center gap-4">
                      <button className="bg-white/20 backdrop-blur-sm text-white border border-white/30 px-8 py-3.5 rounded-full text-sm font-medium font-space-mono tracking-widest uppercase hover:bg-white/30 transition-colors shadow-lg">
                          Talk to Us
                      </button>
                      <Link href="/login" className="bg-[#d4ff63] text-black pl-8 pr-2 py-2 rounded-full flex items-center gap-4 text-sm font-medium font-space-mono tracking-widest uppercase hover:bg-[#c2f04b] transition-colors shadow-lg group">
                          <span>Get Started</span>
                          <div className="bg-black text-white w-10 h-10 rounded-full flex items-center justify-center transform group-hover:scale-105 transition-transform">
                              <svg fill="none" height="16" viewBox="0 0 24 24" width="16" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M5 19L19 5M19 5V19M19 5H5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                              </svg>
                          </div>
                      </Link>
                  </div>
              </div>
              <div className="w-full relative z-10 pb-4 md:pb-6 flex flex-col items-center overflow-hidden">
                  <div className="w-full max-w-7xl h-[180px] md:h-[220px] mb-4 md:mb-6 relative flex items-center mask-edges overflow-hidden">
                      <div className="flex animate-marquee min-w-max">
                          <div className="flex items-center gap-4 md:gap-6 pr-4 md:pr-6">
                              <img src="https://otoma8.com/_next/image?url=%2FcrouselImage%2F1.png&w=384&q=75" className="h-40 md:h-44 w-40 md:w-44 object-cover rounded-[1.5rem] border border-white/20 shadow-lg" alt="Marquee Image 1" />
                              <img src="https://otoma8.com/_next/image?url=%2FcrouselImage%2F2.png&w=384&q=75" className="h-40 md:h-44 w-40 md:w-44 object-cover rounded-[1.5rem] border border-white/20 shadow-lg" alt="Marquee Image 2" />
                              <img src="https://otoma8.com/_next/image?url=%2FcrouselImage%2F3.png&w=384&q=75" className="h-40 md:h-44 w-40 md:w-44 object-cover rounded-[1.5rem] border border-white/20 shadow-lg" alt="Marquee Image 3" />
                              <img src="https://otoma8.com/_next/image?url=%2FcrouselImage%2F6.png&w=384&q=75" className="h-40 md:h-44 w-40 md:w-44 object-cover rounded-[1.5rem] border border-white/20 shadow-lg" alt="Marquee Image 4" />
                              <img src="https://otoma8.com/_next/image?url=%2FcrouselImage%2F8.png&w=384&q=75" className="h-40 md:h-44 w-40 md:w-44 object-cover rounded-[1.5rem] border border-white/20 shadow-lg" alt="Marquee Image 5" />
                              <img src="https://otoma8.com/_next/image?url=%2FcrouselImage%2F9.png&w=384&q=75" className="h-40 md:h-44 w-40 md:w-44 object-cover rounded-[1.5rem] border border-white/20 shadow-lg" alt="Marquee Image 6" />
                          </div>
                          <div className="flex items-center gap-4 md:gap-6 pr-4 md:pr-6">
                              <img src="https://otoma8.com/_next/image?url=%2FcrouselImage%2F1.png&w=384&q=75" className="h-40 md:h-44 w-40 md:w-44 object-cover rounded-[1.5rem] border border-white/20 shadow-lg" alt="Marquee Image 1" />
                              <img src="https://otoma8.com/_next/image?url=%2FcrouselImage%2F2.png&w=384&q=75" className="h-40 md:h-44 w-40 md:w-44 object-cover rounded-[1.5rem] border border-white/20 shadow-lg" alt="Marquee Image 2" />
                              <img src="https://otoma8.com/_next/image?url=%2FcrouselImage%2F3.png&w=384&q=75" className="h-40 md:h-44 w-40 md:w-44 object-cover rounded-[1.5rem] border border-white/20 shadow-lg" alt="Marquee Image 3" />
                              <img src="https://otoma8.com/_next/image?url=%2FcrouselImage%2F6.png&w=384&q=75" className="h-40 md:h-44 w-40 md:w-44 object-cover rounded-[1.5rem] border border-white/20 shadow-lg" alt="Marquee Image 4" />
                              <img src="https://otoma8.com/_next/image?url=%2FcrouselImage%2F8.png&w=384&q=75" className="h-40 md:h-44 w-40 md:w-44 object-cover rounded-[1.5rem] border border-white/20 shadow-lg" alt="Marquee Image 5" />
                              <img src="https://otoma8.com/_next/image?url=%2FcrouselImage%2F9.png&w=384&q=75" className="h-40 md:h-44 w-40 md:w-44 object-cover rounded-[1.5rem] border border-white/20 shadow-lg" alt="Marquee Image 6" />
                          </div>
                      </div>
                  </div>

              </div>
          </main>
      </div>
    </>
  );
}
