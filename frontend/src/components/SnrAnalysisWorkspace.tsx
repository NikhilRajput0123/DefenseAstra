import React, { useEffect, useRef } from 'react';
import { useAudioSession } from '../context/AudioSessionContext';

interface SnrAnalysisWorkspaceProps {
  isRunning: boolean;
}

export const SnrAnalysisWorkspace: React.FC<
  SnrAnalysisWorkspaceProps
> = ({ isRunning }) => {
  const {
    cleanMetadata,
    noiseBuffer,
    mixedBuffer,

    targetSnrDb,
    setTargetSnrDb,

    actualSnrDb,
    processingResponse,
  } = useAudioSession();

  const cleanCanvasRef =
    useRef<HTMLCanvasElement | null>(null);

  const noiseCanvasRef =
    useRef<HTMLCanvasElement | null>(null);

  const mixedCanvasRef =
    useRef<HTMLCanvasElement | null>(null);

  // ============================================================
  // BACKEND METRICS
  // ============================================================

  const metrics = processingResponse?.metrics;

  const snrBefore = metrics?.snr_before ?? null;
  const snrAfter = metrics?.snr_after ?? null;
  const snrImprovement =
    metrics?.snr_improvement ?? null;

  const siSnrBefore =
    metrics?.si_snr_before ?? null;

  const siSnrAfter =
    metrics?.si_snr_after ?? null;

  const stoiBefore =
    metrics?.stoi_before ?? null;

  const stoiAfter =
    metrics?.stoi_after ?? null;

  // ============================================================
  // SNR CONTROL
  // ============================================================

  const handleSnrChange = (newSnr: number) => {
    setTargetSnrDb(newSnr);
  };

  // ============================================================
  // DRAW REAL AUDIO BUFFER
  // ============================================================

  useEffect(() => {
    const drawAudioBuffer = (
      canvas: HTMLCanvasElement | null,
      buffer: AudioBuffer | null,
      lineColor: string,
      placeholderText: string
    ) => {
      if (!canvas) return;

      const ctx = canvas.getContext('2d');

      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;

      // Background
      ctx.fillStyle = '#0B0E0B';
      ctx.fillRect(
        0,
        0,
        width,
        height
      );

      // Center line
      ctx.strokeStyle = '#182017';
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.moveTo(
        0,
        height / 2
      );
      ctx.lineTo(
        width,
        height / 2
      );
      ctx.stroke();

      if (!buffer) {
        ctx.fillStyle = '#4E5A47';
        ctx.font =
          '10px "JetBrains Mono", monospace';

        ctx.textAlign = 'center';

        ctx.fillText(
          placeholderText,
          width / 2,
          height / 2 - 4
        );

        return;
      }

      const channelData =
        buffer.getChannelData(0);

      const samplesPerPixel = Math.max(
        1,
        Math.floor(
          channelData.length / width
        )
      );

      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1.25;

      ctx.beginPath();

      for (
        let x = 0;
        x < width;
        x++
      ) {
        const start =
          x * samplesPerPixel;

        const end = Math.min(
          start + samplesPerPixel,
          channelData.length
        );

        let min = 1;
        let max = -1;

        for (
          let i = start;
          i < end;
          i++
        ) {
          const sample =
            channelData[i];

          if (sample < min) {
            min = sample;
          }

          if (sample > max) {
            max = sample;
          }
        }

        const yMin =
          height / 2 -
          max * height * 0.42;

        const yMax =
          height / 2 -
          min * height * 0.42;

        ctx.moveTo(x, yMin);
        ctx.lineTo(x, yMax);
      }

      ctx.stroke();
    };

    drawAudioBuffer(
      cleanCanvasRef.current,
      cleanMetadata?.audioBuffer ?? null,
      '#A3B17D',
      'CLEAN SIGNAL: WAITING FOR INPUT'
    );

    drawAudioBuffer(
      noiseCanvasRef.current,
      noiseBuffer,
      '#7D8A68',
      'NOISE SIGNAL: WAITING FOR INPUT'
    );

    drawAudioBuffer(
      mixedCanvasRef.current,
      mixedBuffer,
      '#C4D4A3',
      'MIXED SIGNAL: WAITING FOR INPUT'
    );
  }, [
    cleanMetadata?.audioBuffer,
    noiseBuffer,
    mixedBuffer,
  ]);

  // ============================================================
  // HELPERS
  // ============================================================

  const formatDb = (
    value: number | null
  ) => {
    if (value === null) return '--';

    return `${value >= 0 ? '+' : ''}${value.toFixed(
      2
    )} dB`;
  };

  const formatValue = (
    value: number | null
  ) => {
    if (value === null) return '--';

    return value.toFixed(3);
  };

  const cleanDuration =
    cleanMetadata?.durationSeconds ?? null;

  const noiseDuration =
    noiseBuffer?.duration ?? null;

  const mixedDuration =
    mixedBuffer?.duration ?? null;

  const actualSNR =
    actualSnrDb ??
    processingResponse?.actual_snr_db ??
    null;

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <section className="bg-[#0B0E0B] border border-[#232B20] p-3 font-mono text-xs">

      {/* ======================================================
          HEADER
      ====================================================== */}

      <div className="flex flex-wrap items-center justify-between pb-2 mb-3 border-b border-[#1F261C]">

        <div className="flex items-center space-x-2">

          <span className="w-2 h-2 bg-[#69754B]"></span>

          <span className="font-bold text-[#E2E6DF] tracking-wider uppercase">
            SNR ANALYSIS WORKSPACE
          </span>

          <span className="text-[10px] text-[#717C67]">
            [REAL AUDIO + BACKEND METRICS]
          </span>

        </div>

        {/* SNR Control */}
        <div className="flex items-center space-x-3 bg-[#111611] border border-[#242D20] px-3 py-1.5">

          <span className="text-[11px] text-[#8C9881]">
            TARGET SNR:
          </span>

          <input
            type="range"
            min="-10"
            max="30"
            step="1"
            value={targetSnrDb}
            onChange={(e) =>
              handleSnrChange(
                Number(e.target.value)
              )
            }
            className="w-28 accent-[#7D8C61] cursor-pointer"
          />

          <span className="text-[11px] font-bold text-[#C8D6AE] w-12 text-right">
            {targetSnrDb > 0
              ? `+${targetSnrDb}`
              : targetSnrDb}{' '}
            dB
          </span>

        </div>
      </div>

      {/* ======================================================
          ARCHITECTURE FLOW
      ====================================================== */}

      <div className="flex flex-wrap items-center justify-center p-2 mb-3 bg-[#0E120E] border border-[#1E251B] text-[11px]">

        <span className="text-[#8C9881] font-semibold">
          CLEAN AUDIO + NOISE AUDIO
        </span>

        <span className="mx-3 text-[#5A6750]">
          ↓ [CLIENT MIX @ {targetSnrDb} dB TARGET] ↓
        </span>

        <span className="text-[#C4D4A3] font-bold">
          MIXED AUDIO
        </span>

        {processingResponse && (
          <>
            <span className="mx-3 text-[#5A6750]">
              ↓ AI ENHANCEMENT ↓
            </span>

            <span className="text-[#A4BA75] font-bold">
              NIRVAN ENHANCED
            </span>
          </>
        )}

      </div>

      {/* ======================================================
          3 TECHNICAL WAVEFORM AREAS
      ====================================================== */}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

        {/* ====================================================
            CLEAN AUDIO
        ==================================================== */}

        <div className="border border-[#1E251B] bg-[#0E120E] flex flex-col">

          <div className="px-3 py-2 bg-[#121712] border-b border-[#1E251B] flex items-center justify-between">

            <span className="font-bold text-[#D0D6CA] tracking-wide uppercase">
              CLEAN AUDIO
            </span>

            <span className="text-[10px] text-[#78856F]">
              REAL INPUT
            </span>

          </div>

          <div className="h-36 relative bg-[#090C09] border-b border-[#1A2218]">

            <canvas
              ref={cleanCanvasRef}
              width={400}
              height={144}
              className="w-full h-full block"
            />

          </div>

          <div className="p-2.5 space-y-1.5 text-[10px] bg-[#0C100C]">

            <div className="flex justify-between">
              <span className="text-[#6C7862]">
                SNR:
              </span>

              <span className="font-semibold text-[#D0D6CA]">
                REFERENCE
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-[#6C7862]">
                SOURCE:
              </span>

              <span className="font-semibold text-[#D0D6CA]">
                {cleanMetadata
                  ? 'UPLOADED / RECORDED AUDIO'
                  : '--'}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-[#6C7862]">
                SAMPLE RATE:
              </span>

              <span className="font-semibold text-[#D0D6CA]">
                {cleanMetadata?.sampleRate
                  ? `${cleanMetadata.sampleRate} Hz`
                  : '--'}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-[#6C7862]">
                DURATION:
              </span>

              <span className="font-semibold text-[#D0D6CA]">
                {cleanDuration !== null
                  ? `${cleanDuration.toFixed(2)} s`
                  : '--'}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-[#6C7862]">
                STATUS:
              </span>

              <span
                className={`font-semibold ${
                  cleanMetadata
                    ? 'text-[#9CB074]'
                    : 'text-[#6C7862]'
                }`}
              >
                {cleanMetadata
                  ? 'READY'
                  : 'WAITING FOR INPUT'}
              </span>
            </div>

          </div>
        </div>

        {/* ====================================================
            NOISE AUDIO
        ==================================================== */}

        <div className="border border-[#1E251B] bg-[#0E120E] flex flex-col">

          <div className="px-3 py-2 bg-[#121712] border-b border-[#1E251B] flex items-center justify-between">

            <span className="font-bold text-[#D0D6CA] tracking-wide uppercase">
              NOISE AUDIO
            </span>

            <span className="text-[10px] text-[#78856F]">
              SELECTED NOISE
            </span>

          </div>

          <div className="h-36 relative bg-[#090C09] border-b border-[#1A2218]">

            <canvas
              ref={noiseCanvasRef}
              width={400}
              height={144}
              className="w-full h-full block"
            />

          </div>

          <div className="p-2.5 space-y-1.5 text-[10px] bg-[#0C100C]">

            <div className="flex justify-between">
              <span className="text-[#6C7862]">
                TYPE:
              </span>

              <span className="font-semibold text-[#D0D6CA]">
                {noiseBuffer
                  ? 'SELECTED NOISE'
                  : '--'}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-[#6C7862]">
                SOURCE:
              </span>

              <span className="font-semibold text-[#D0D6CA]">
                {noiseBuffer
                  ? 'NOISE INPUT'
                  : '--'}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-[#6C7862]">
                DURATION:
              </span>

              <span className="font-semibold text-[#D0D6CA]">
                {noiseDuration !== null
                  ? `${noiseDuration.toFixed(2)} s`
                  : '--'}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-[#6C7862]">
                STATUS:
              </span>

              <span
                className={`font-semibold ${
                  noiseBuffer
                    ? 'text-[#9CB074]'
                    : 'text-[#6C7862]'
                }`}
              >
                {noiseBuffer
                  ? 'LOADED'
                  : 'WAITING FOR INPUT'}
              </span>
            </div>

          </div>
        </div>

        {/* ====================================================
            MIXED AUDIO
        ==================================================== */}

        <div className="border border-[#283622] bg-[#0E120E] flex flex-col">

          <div className="px-3 py-2 bg-[#141A13] border-b border-[#283622] flex items-center justify-between">

            <span className="font-bold text-[#E2E8DC] tracking-wide uppercase">
              MIXED AUDIO
            </span>

            <span className="text-[10px] text-[#9CB074]">
              REAL MIX OUTPUT
            </span>

          </div>

          <div className="h-36 relative bg-[#090C09] border-b border-[#1A2218]">

            <canvas
              ref={mixedCanvasRef}
              width={400}
              height={144}
              className="w-full h-full block"
            />

          </div>

          <div className="p-2.5 space-y-1.5 text-[10px] bg-[#0C100C]">

            <div className="flex justify-between">
              <span className="text-[#6C7862]">
                TARGET SNR:
              </span>

              <span className="font-semibold text-[#C4D4A3]">
                {mixedBuffer
                  ? `${
                      targetSnrDb >= 0
                        ? '+'
                        : ''
                    }${targetSnrDb.toFixed(1)} dB`
                  : '--'}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-[#6C7862]">
                ACTUAL SNR:
              </span>

              <span className="font-semibold text-[#C4D4A3]">
                {actualSNR !== null
                  ? formatDb(actualSNR)
                  : '--'}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-[#6C7862]">
                DURATION:
              </span>

              <span className="font-semibold text-[#D0D6CA]">
                {mixedDuration !== null
                  ? `${mixedDuration.toFixed(2)} s`
                  : '--'}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-[#6C7862]">
                STATUS:
              </span>

              <span
                className={`font-semibold ${
                  mixedBuffer
                    ? 'text-[#C4D4A3]'
                    : 'text-[#6C7862]'
                }`}
              >
                {mixedBuffer
                  ? 'MIX COMPLETE'
                  : 'WAITING FOR INPUT'}
              </span>
            </div>

          </div>
        </div>

      </div>

      {/* ======================================================
          REAL AI METRICS
      ====================================================== */}

      <div className="mt-3 border border-[#283622] bg-[#0E120E]">

        <div className="px-3 py-2 bg-[#141A13] border-b border-[#283622] flex items-center justify-between">

          <span className="font-bold text-[#E2E8DC] tracking-wide">
            NIRVAN AI — MEASURED RESULTS
          </span>

          <span className="text-[10px] text-[#9CB074]">
            {processingResponse
              ? 'BACKEND RESULT'
              : 'NO RESULT YET'}
          </span>

        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px bg-[#283622]">

          <div className="bg-[#0B0E0B] p-3">
            <div className="text-[9px] text-[#69755F]">
              SNR BEFORE
            </div>

            <div className="text-sm font-bold text-[#D0D6CA] mt-1">
              {formatDb(snrBefore)}
            </div>
          </div>

          <div className="bg-[#0B0E0B] p-3">
            <div className="text-[9px] text-[#69755F]">
              SNR AFTER
            </div>

            <div className="text-sm font-bold text-[#C4D4A3] mt-1">
              {formatDb(snrAfter)}
            </div>
          </div>

          <div className="bg-[#0B0E0B] p-3">
            <div className="text-[9px] text-[#69755F]">
              SNR IMPROVEMENT
            </div>

            <div className="text-sm font-bold text-[#A4BA75] mt-1">
              {formatDb(snrImprovement)}
            </div>
          </div>

          <div className="bg-[#0B0E0B] p-3">
            <div className="text-[9px] text-[#69755F]">
              SI-SNR
            </div>

            <div className="text-sm font-bold text-[#D0D6CA] mt-1">
              {siSnrBefore !== null &&
              siSnrAfter !== null
                ? `${siSnrBefore.toFixed(
                    2
                  )} → ${siSnrAfter.toFixed(
                    2
                  )} dB`
                : '--'}
            </div>
          </div>

          <div className="bg-[#0B0E0B] p-3">
            <div className="text-[9px] text-[#69755F]">
              STOI
            </div>

            <div className="text-sm font-bold text-[#D0D6CA] mt-1">
              {stoiBefore !== null &&
              stoiAfter !== null
                ? `${formatValue(
                    stoiBefore
                  )} → ${formatValue(
                    stoiAfter
                  )}`
                : '--'}
            </div>
          </div>

          <div className="bg-[#0B0E0B] p-3">
            <div className="text-[9px] text-[#69755F]">
              MODEL
            </div>

            <div className="text-[10px] font-bold text-[#C4D4A3] mt-1 break-all">
              {processingResponse
                ?.model_used ??
                '--'}
            </div>
          </div>

        </div>

      </div>

    </section>
  );
};