import React, { useEffect, useState } from 'react';

interface LandingPageProps {
  onEnter: () => void;
}

const noiseClasses = [
  'HELICOPTER',
  'GUNSHOT',
  'EXPLOSION',
  'ARTILLERY',
  'DRONE',
  'MILITARY VEHICLE',
  'HEAVY ENGINE',
  'WIND',
  'TRAFFIC',
  'MACHINERY',
  'SIREN',
  'CROWD',
];

export default function LandingPage({
  onEnter,
}: LandingPageProps) {
  const [bootComplete, setBootComplete] =
    useState(false);

  const [currentNoise, setCurrentNoise] =
    useState(0);

  const [signalBars, setSignalBars] =
    useState<number[]>(
      Array.from(
        { length: 72 },
        () => Math.random()
      )
    );

  /*
   * ============================================================
   * SYSTEM BOOT
   * ============================================================
   */

  useEffect(() => {
    const timer =
      window.setTimeout(() => {
        setBootComplete(true);
      }, 900);

    return () =>
      window.clearTimeout(timer);
  }, []);

  /*
   * ============================================================
   * NOISE CLASS ROTATION
   * ============================================================
   */

  useEffect(() => {
    const interval =
      window.setInterval(() => {
        setCurrentNoise(
          (previous) =>
            (previous + 1) %
            noiseClasses.length
        );
      }, 1800);

    return () =>
      window.clearInterval(interval);
  }, []);

  /*
   * ============================================================
   * SIGNAL ANIMATION
   * ============================================================
   */

  useEffect(() => {
    const interval =
      window.setInterval(() => {
        setSignalBars(
          Array.from(
            { length: 72 },
            (_, index) => {
              const wave =
                Math.sin(
                  index * 0.42 +
                    Date.now() * 0.004
                );

              const wave2 =
                Math.sin(
                  index * 0.17 +
                    Date.now() * 0.002
                );

              const wave3 =
                Math.sin(
                  index * 0.07 +
                    Date.now() * 0.001
                );

              return (
                0.18 +
                Math.abs(
                  wave * 0.32 +
                    wave2 * 0.18 +
                    wave3 * 0.12
                ) +
                Math.random() * 0.22
              );
            }
          )
        );
      }, 90);

    return () =>
      window.clearInterval(interval);
  }, []);

  const handleEnter = () => {
    if (!bootComplete) return;

    onEnter();
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#030603] text-[#E0E5DC] font-mono">

      {/* ======================================================
          AMBIENT BACKGROUND
      ====================================================== */}

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(
              circle at 72% 44%,
              rgba(105,135,72,0.13) 0%,
              rgba(53,72,38,0.055) 25%,
              transparent 58%
            ),
            radial-gradient(
              circle at 18% 78%,
              rgba(75,95,55,0.06) 0%,
              transparent 42%
            )
          `,
        }}
      />

      {/* Technical Grid */}

      <div
        className="absolute inset-0 opacity-[0.22] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(
              rgba(116,140,91,0.13) 1px,
              transparent 1px
            ),
            linear-gradient(
              90deg,
              rgba(116,140,91,0.13) 1px,
              transparent 1px
            )
          `,
          backgroundSize:
            '44px 44px',
        }}
      />

      {/* Fine Grid */}

      <div
        className="absolute inset-0 opacity-[0.08] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(
              rgba(160,180,135,0.12) 1px,
              transparent 1px
            ),
            linear-gradient(
              90deg,
              rgba(160,180,135,0.12) 1px,
              transparent 1px
            )
          `,
          backgroundSize:
            '11px 11px',
        }}
      />

      {/* Scanlines */}

      <div
        className="absolute inset-0 pointer-events-none opacity-[0.035]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent 0px, transparent 3px, #A4BA75 4px)',
        }}
      />

      {/* ======================================================
          HEADER
      ====================================================== */}

      <header className="relative z-20 h-16 border-b border-[#20291D] bg-[#050805]/90 backdrop-blur-md flex items-center justify-between px-5 md:px-8">

        <div className="flex items-center gap-3">

          <div className="relative">

            <span className="block w-2 h-2 bg-[#A4BA75] shadow-[0_0_14px_rgba(164,186,117,0.85)]" />

            <span className="absolute inset-[-4px] border border-[#718452]/30 animate-ping" />

          </div>

          <div>

            <div className="text-[13px] tracking-[0.28em] font-bold text-[#E0E6DA]">
              NIRVAN AI
            </div>

            <div className="text-[8px] tracking-[0.22em] text-[#5C6A52]">
              DEFENCE AUDIO INTELLIGENCE
            </div>

          </div>

        </div>

        <div className="flex items-center gap-4 md:gap-7 text-[9px]">

          <div className="hidden sm:block text-[#485543]">
            SYS / 01
          </div>

          <div className="hidden md:block text-[#485543]">
            SIH26052
          </div>

          <div className="hidden lg:block text-[#485543]">
            AI / ML AUDIO SYSTEM
          </div>

          <div className="flex items-center gap-2">

            <span className="relative flex h-2 w-2">

              <span className="absolute inline-flex h-full w-full rounded-full bg-[#91AA6B] opacity-60 animate-ping" />

              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#A4BA75]" />

            </span>

            <span className="text-[#93A283] tracking-[0.12em]">
              SYSTEM READY
            </span>

          </div>

        </div>

      </header>

      {/* ======================================================
          MAIN
      ====================================================== */}

      <div className="relative z-10 h-[calc(100vh-64px)] flex flex-col">

        <section className="flex-1 flex items-center justify-center px-5 md:px-8 py-7">

          <div className="w-full max-w-[1240px] grid grid-cols-1 lg:grid-cols-[1.04fr_0.96fr] gap-10 lg:gap-16 items-center">

            {/* ==================================================
                LEFT HERO
            ================================================== */}

            <div>

              {/* Eyebrow */}

              <div className="flex items-center gap-3 mb-6">

                <span className="px-2 py-1 border border-[#34412C] bg-[#0A0F09] text-[8px] tracking-[0.24em] text-[#7C8D69]">
                  SYSTEM 01
                </span>

                <span className="h-px w-12 bg-[#394631]" />

                <span className="text-[8px] tracking-[0.25em] text-[#53604D]">
                  AI-ASSISTED AUDIO INTELLIGENCE
                </span>

              </div>

              {/* Brand */}

              <h1 className="leading-[0.78] select-none">

                <span className="block text-[clamp(62px,10.5vw,138px)] font-black tracking-[-0.075em] text-[#E0E5DC]">
                  NIRVAN
                </span>

                <span className="block mt-3 text-[clamp(42px,6.5vw,78px)] font-bold tracking-[0.1em] text-[#91A96D]">
                  AI
                </span>

              </h1>

              {/* Accent line */}

              <div className="flex items-center gap-3 mt-7">

                <span className="w-10 h-[2px] bg-[#8EA56A]" />

                <span className="w-2 h-2 border border-[#8EA56A] rotate-45" />

                <span className="text-[9px] tracking-[0.25em] text-[#66745B]">
                  DEFENCE AUDIO SYSTEM
                </span>

              </div>

              {/* Description */}

              <div className="mt-6 max-w-[650px]">

                <p className="text-[14px] md:text-[16px] leading-7 text-[#A0AA99]">
                  AI-assisted defence audio
                  intelligence for high-noise
                  communication environments.
                </p>

                <p className="mt-3 text-[10px] md:text-[11px] leading-5 text-[#596653] max-w-[590px]">
                  Neural noise classification,
                  spectral enhancement and
                  real-time audio analysis
                  designed for complex acoustic
                  environments.
                </p>

              </div>

              {/* CTA */}

              <button
                type="button"
                onClick={handleEnter}
                disabled={!bootComplete}
                className={`
                  group
                  relative
                  mt-8
                  inline-flex
                  items-center
                  gap-5
                  px-6
                  py-3.5
                  overflow-hidden
                  border
                  transition-all
                  duration-300
                  ${
                    bootComplete
                      ? `
                        border-[#718452]
                        bg-[#111A0F]
                        text-[#E1E7DA]
                        hover:bg-[#1C2917]
                        hover:border-[#A4BA75]
                        hover:shadow-[0_0_28px_rgba(126,157,87,0.14)]
                        cursor-pointer
                      `
                      : `
                        border-[#293225]
                        bg-[#090D09]
                        text-[#475340]
                        cursor-wait
                      `
                  }
                `}
              >

                {/* Hover sweep */}

                {bootComplete && (
                  <span className="absolute inset-y-0 left-0 w-0 bg-[#A4BA75]/10 transition-all duration-500 group-hover:w-full" />
                )}

                <span className="relative text-[10px] font-bold tracking-[0.22em]">
                  {bootComplete
                    ? 'ENTER NIRVAN SYSTEM'
                    : 'INITIALIZING SYSTEM...'}
                </span>

                <span className="relative text-[17px] transition-transform duration-300 group-hover:translate-x-1">
                  →
                </span>

              </button>

              {/* System Telemetry */}

              <div className="mt-6 flex flex-wrap gap-2">

                <div className="flex items-center gap-2 px-2.5 py-1.5 border border-[#20291D] bg-[#080C08]/80">

                  <span className="w-1.5 h-1.5 bg-[#91AA6B]" />

                  <span className="text-[8px] text-[#5F6D56]">
                    AUDIO CORE
                  </span>

                  <span className="text-[8px] text-[#9BAF73]">
                    ONLINE
                  </span>

                </div>

                <div className="flex items-center gap-2 px-2.5 py-1.5 border border-[#20291D] bg-[#080C08]/80">

                  <span className="w-1.5 h-1.5 bg-[#91AA6B]" />

                  <span className="text-[8px] text-[#5F6D56]">
                    AI MODELS
                  </span>

                  <span className="text-[8px] text-[#9BAF73]">
                    LOADED
                  </span>

                </div>

                <div className="flex items-center gap-2 px-2.5 py-1.5 border border-[#20291D] bg-[#080C08]/80">

                  <span className="w-1.5 h-1.5 bg-[#91AA6B]" />

                  <span className="text-[8px] text-[#5F6D56]">
                    INFERENCE
                  </span>

                  <span className="text-[8px] text-[#9BAF73]">
                    READY
                  </span>

                </div>

              </div>

            </div>

            {/* ==================================================
                RIGHT VISUALIZER
            ================================================== */}

            <div className="relative">

              {/* Outer technical corners */}

              <span className="absolute -top-2 -left-2 w-5 h-5 border-l border-t border-[#8A9F67]" />
              <span className="absolute -top-2 -right-2 w-5 h-5 border-r border-t border-[#8A9F67]" />
              <span className="absolute -bottom-2 -left-2 w-5 h-5 border-l border-b border-[#8A9F67]" />
              <span className="absolute -bottom-2 -right-2 w-5 h-5 border-r border-b border-[#8A9F67]" />

              <div className="border border-[#293426] bg-[#070C07]/95 shadow-[0_0_50px_rgba(75,100,53,0.07)]">

                {/* Panel Header */}

                <div className="h-11 px-4 border-b border-[#20291D] flex items-center justify-between">

                  <div className="flex items-center gap-2">

                    <span className="text-[9px] tracking-[0.18em] text-[#7C896F]">
                      ACOUSTIC ENVIRONMENT
                    </span>

                    <span className="px-1.5 py-0.5 border border-[#2D3A27] text-[7px] text-[#68765D]">
                      AI MONITOR
                    </span>

                  </div>

                  <div className="flex items-center gap-2">

                    <span className="w-1.5 h-1.5 rounded-full bg-[#91AA6B]" />

                    <span className="text-[8px] tracking-[0.12em] text-[#65725B]">
                      LIVE ANALYSIS
                    </span>

                  </div>

                </div>

                {/* Visualizer */}

                <div className="h-[250px] md:h-[315px] relative overflow-hidden px-4">

                  {/* horizontal grid */}

                  <div className="absolute inset-x-4 top-[25%] h-px bg-[#151D14]" />

                  <div className="absolute inset-x-4 top-1/2 h-px bg-[#273224]" />

                  <div className="absolute inset-x-4 top-[75%] h-px bg-[#151D14]" />

                  {/* vertical grid */}

                  <div className="absolute inset-4 grid grid-cols-8 pointer-events-none">

                    {Array.from(
                      { length: 7 }
                    ).map((_, index) => (
                      <div
                        key={index}
                        className="border-r border-[#111811]"
                      />
                    ))}

                  </div>

                  {/* Signal bars */}

                  <div className="absolute inset-4 flex items-center justify-between gap-[2px]">

                    {signalBars.map(
                      (value, index) => {

                        const height =
                          Math.max(
                            6,
                            Math.min(
                              92,
                              value * 82
                            )
                          );

                        return (
                          <div
                            key={index}
                            className="flex-1 flex items-center justify-center h-full"
                          >

                            <div
                              className="w-full max-w-[4px] rounded-[1px] bg-[#73865A]"
                              style={{
                                height: `${height}%`,
                                opacity:
                                  0.25 +
                                  value * 0.65,
                              }}
                            />

                          </div>
                        );
                      }
                    )}

                  </div>

                  {/* Scanning line */}

                  <div
                    className="absolute top-0 bottom-0 w-px bg-[#A4BA75]/45 shadow-[0_0_10px_rgba(164,186,117,0.25)]"
                    style={{
                      animation:
                        'nirvanScan 3.5s linear infinite',
                    }}
                  />

                  {/* Center detection */}

                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">

                    <div className="text-[8px] tracking-[0.3em] text-[#56644E]">
                      DETECTED ENVIRONMENT
                    </div>

                    <div className="mt-3 text-[18px] md:text-[20px] tracking-[0.13em] font-bold text-[#A7B886]">
                      {noiseClasses[currentNoise]}
                    </div>

                    <div className="mt-2 flex items-center justify-center gap-2">

                      <span className="w-12 h-px bg-[#34422D]" />

                      <span className="text-[7px] text-[#596650] tracking-[0.15em]">
                        CLASS-{String(
                          currentNoise + 1
                        ).padStart(2, '0')}
                      </span>

                      <span className="w-12 h-px bg-[#34422D]" />

                    </div>

                  </div>

                  {/* Corner telemetry */}

                  <div className="absolute left-5 top-5 text-[7px] text-[#485642] tracking-[0.12em]">
                    INPUT / AUDIO
                  </div>

                  <div className="absolute right-5 top-5 text-[7px] text-[#485642] tracking-[0.12em]">
                    16.0 kHz
                  </div>

                  <div className="absolute left-5 bottom-5 text-[7px] text-[#485642] tracking-[0.12em]">
                    SPECTRAL MONITOR
                  </div>

                  <div className="absolute right-5 bottom-5 text-[7px] text-[#485642] tracking-[0.12em]">
                    ONLINE
                  </div>

                </div>

                {/* Telemetry Cards */}

                <div className="grid grid-cols-3 border-t border-[#20291D]">

                  <div className="px-4 py-3 border-r border-[#20291D]">

                    <div className="text-[7px] tracking-[0.12em] text-[#4F5C49]">
                      NOISE CLASSES
                    </div>

                    <div className="mt-1 text-[17px] font-bold text-[#B3C09F]">
                      12
                    </div>

                    <div className="mt-0.5 text-[7px] text-[#53604C]">
                      CLASSIFICATION
                    </div>

                  </div>

                  <div className="px-4 py-3 border-r border-[#20291D]">

                    <div className="text-[7px] tracking-[0.12em] text-[#4F5C49]">
                      AI ENGINE
                    </div>

                    <div className="mt-1 flex items-center gap-2">

                      <span className="w-1.5 h-1.5 rounded-full bg-[#91AA6B]" />

                      <span className="text-[10px] font-bold text-[#93A875]">
                        ONLINE
                      </span>

                    </div>

                    <div className="mt-0.5 text-[7px] text-[#53604C]">
                      INFERENCE READY
                    </div>

                  </div>

                  <div className="px-4 py-3">

                    <div className="text-[7px] tracking-[0.12em] text-[#4F5C49]">
                      SAMPLE RATE
                    </div>

                    <div className="mt-1 text-[10px] font-bold text-[#93A875]">
                      16 kHz
                    </div>

                    <div className="mt-0.5 text-[7px] text-[#53604C]">
                      MONO AUDIO
                    </div>

                  </div>

                </div>

              </div>

            </div>

          </div>

        </section>

        {/* ====================================================
            CAPABILITIES
        ==================================================== */}

        <section className="border-t border-[#1B2319] bg-[#050805]/95 backdrop-blur-sm">

          <div className="max-w-[1240px] mx-auto grid grid-cols-1 sm:grid-cols-3">

            <div className="group px-5 md:px-7 py-4 border-b sm:border-b-0 sm:border-r border-[#1B2319] hover:bg-[#0A0F09] transition-colors">

              <div className="flex items-center justify-between">

                <div className="text-[8px] tracking-[0.18em] text-[#56644E]">
                  01 / CLASSIFICATION
                </div>

                <span className="text-[9px] text-[#4A5844]">
                  AI
                </span>

              </div>

              <div className="mt-1 text-[11px] font-bold text-[#9AA78B]">
                12-CLASS NOISE INTELLIGENCE
              </div>

            </div>

            <div className="group px-5 md:px-7 py-4 border-b sm:border-b-0 sm:border-r border-[#1B2319] hover:bg-[#0A0F09] transition-colors">

              <div className="flex items-center justify-between">

                <div className="text-[8px] tracking-[0.18em] text-[#56644E]">
                  02 / ENHANCEMENT
                </div>

                <span className="text-[9px] text-[#4A5844]">
                  U-NET
                </span>

              </div>

              <div className="mt-1 text-[11px] font-bold text-[#9AA78B]">
                AI SPECTRAL ENHANCEMENT
              </div>

            </div>

            <div className="group px-5 md:px-7 py-4 hover:bg-[#0A0F09] transition-colors">

              <div className="flex items-center justify-between">

                <div className="text-[8px] tracking-[0.18em] text-[#56644E]">
                  03 / ANALYSIS
                </div>

                <span className="text-[9px] text-[#4A5844]">
                  DSP
                </span>

              </div>

              <div className="mt-1 text-[11px] font-bold text-[#9AA78B]">
                REAL AUDIO SIGNAL ANALYSIS
              </div>

            </div>

          </div>

        </section>

        {/* ====================================================
            FOOTER
        ==================================================== */}

        <footer className="h-8 px-5 md:px-8 flex items-center justify-between text-[8px] text-[#475241] tracking-[0.1em]">

          <span>
            NIRVAN AI / SIH26052
          </span>

          <span className="hidden sm:inline">
            AI-ASSISTED DEFENCE AUDIO COMMUNICATION
          </span>

          <span>
            SYSTEM 01
          </span>

        </footer>

      </div>

      {/* ======================================================
          ANIMATIONS
      ====================================================== */}

      <style>
        {`
          @keyframes nirvanScan {
            0% {
              left: 0%;
              opacity: 0;
            }

            8% {
              opacity: 1;
            }

            92% {
              opacity: 1;
            }

            100% {
              left: 100%;
              opacity: 0;
            }
          }
        `}
      </style>

    </main>
  );
}