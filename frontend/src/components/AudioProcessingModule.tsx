import React, { useEffect, useRef } from 'react';
import { useAudioSession } from '../context/AudioSessionContext';

interface AudioProcessingModuleProps {
  isRunning: boolean;
}

export const AudioProcessingModule: React.FC<AudioProcessingModuleProps> = ({
  isRunning,
}) => {
  const beforeCanvasRef =
    useRef<HTMLCanvasElement | null>(null);

  const afterCanvasRef =
    useRef<HTMLCanvasElement | null>(null);

  const { processingResponse } =
    useAudioSession();

  const waveform =
    processingResponse?.waveform ?? null;

  const metrics =
    processingResponse?.metrics ?? null;

  const noisySamples =
    waveform?.noisy?.samples ?? [];

  const enhancedSamples =
    waveform?.enhanced?.samples ?? [];

  /*
   * ============================================================
   * DRAW BACKEND WAVEFORM
   * ============================================================
   */

  const drawWaveform = (
    canvas: HTMLCanvasElement | null,
    data: number[],
    waveformColor: string,
    emptyLabel: string
  ) => {
    if (!canvas) {
      return;
    }

    const ctx =
      canvas.getContext('2d');

    if (!ctx) {
      return;
    }

    const width =
      canvas.width;

    const height =
      canvas.height;

    /*
     * Background
     */
    ctx.fillStyle =
      '#090C09';

    ctx.fillRect(
      0,
      0,
      width,
      height
    );

    /*
     * Grid
     */
    ctx.strokeStyle =
      '#182017';

    ctx.lineWidth = 1;

    for (
      let i = 1;
      i < 4;
      i++
    ) {
      const y =
        (height / 4) * i;

      ctx.beginPath();

      ctx.moveTo(
        0,
        y
      );

      ctx.lineTo(
        width,
        y
      );

      ctx.stroke();
    }

    for (
      let i = 1;
      i < 8;
      i++
    ) {
      const x =
        (width / 8) * i;

      ctx.beginPath();

      ctx.moveTo(
        x,
        0
      );

      ctx.lineTo(
        x,
        height
      );

      ctx.stroke();
    }

    /*
     * Center line
     */
    ctx.strokeStyle =
      '#283325';

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

    /*
     * Empty state
     */
    if (!data.length) {
      ctx.fillStyle =
        '#4E5A47';

      ctx.font =
        '10px "JetBrains Mono", monospace';

      ctx.textAlign =
        'center';

      ctx.textBaseline =
        'middle';

      ctx.fillText(
        emptyLabel,
        width / 2,
        height / 2
      );

      return;
    }

    /*
     * Backend waveform → canvas
     *
     * The backend contains the actual waveform.
     * Downsampling here is ONLY for visualization.
     */
    const maxPoints = 2500;

    const step =
      Math.max(
        1,
        Math.ceil(
          data.length / maxPoints
        )
      );

    const pointCount =
      Math.ceil(
        data.length / step
      );

    const sliceWidth =
      width /
      Math.max(
        1,
        pointCount - 1
      );

    ctx.strokeStyle =
      waveformColor;

    ctx.lineWidth = 1.25;

    ctx.beginPath();

    let pointIndex = 0;

    for (
      let i = 0;
      i < data.length;
      i += step
    ) {
      const value =
        Number(data[i]) || 0;

      const clamped =
        Math.max(
          -1,
          Math.min(
            1,
            value
          )
        );

      const x =
        pointIndex *
        sliceWidth;

      const y =
        height / 2 -
        clamped *
          (height * 0.43);

      if (
        pointIndex === 0
      ) {
        ctx.moveTo(
          x,
          y
        );
      } else {
        ctx.lineTo(
          x,
          y
        );
      }

      pointIndex++;
    }

    ctx.stroke();
  };

  /*
   * ============================================================
   * DRAW BACKEND DATA
   * ============================================================
   */

  useEffect(() => {
    drawWaveform(
      beforeCanvasRef.current,
      noisySamples,
      '#7D8C61',
      'WAITING FOR BACKEND AUDIO'
    );

    drawWaveform(
      afterCanvasRef.current,
      enhancedSamples,
      '#A4BA75',
      'WAITING FOR AI ENHANCEMENT'
    );
  }, [
    processingResponse,
    noisySamples,
    enhancedSamples,
  ]);

  const snrImprovement =
    metrics?.snr_improvement;

  const status =
    processingResponse
      ? 'AI PROCESSING COMPLETE'
      : isRunning
        ? 'AI PROCESSING'
        : 'READY';

  return (
    <section className="bg-[#0B0E0B] border border-[#232B20] p-3 font-mono text-xs">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between pb-2 mb-3 border-b border-[#1F261C]">

        <div className="flex items-center space-x-2">

          <span className="w-2 h-2 bg-[#69754B]" />

          <span className="font-bold text-[#E2E6DF] tracking-wider uppercase">
            AI AUDIO PROCESSING PIPELINE
          </span>

          <span className="text-[10px] text-[#717C67]">
            [NIRVAN AI BACKEND]
          </span>

        </div>

        <div className="text-[10px] text-[#7E8C72]">
          AI STATUS:{' '}
          <span className="text-[#A4BA75] font-semibold">
            {status}
          </span>
        </div>

      </div>

      {/* AI Pipeline Flow */}
      <div className="flex items-center justify-between p-2 mb-3 bg-[#0E120E] border border-[#1E251B] text-[11px] overflow-x-auto">

        <span className="px-2 py-1 bg-[#131913] text-[#A6B494] font-semibold shrink-0">
          INPUT AUDIO
        </span>

        <span className="text-[#4E5A47] px-1 shrink-0">
          ↓
        </span>

        <span className="px-2 py-1 bg-[#131913] text-[#CBD4C2] font-semibold shrink-0">
          NOISE CLASSIFIER
        </span>

        <span className="text-[#4E5A47] px-1 shrink-0">
          ↓
        </span>

        <span className="px-2 py-1 bg-[#131913] text-[#CBD4C2] font-semibold shrink-0">
          SPECTRAL U-NET
        </span>

        <span className="text-[#4E5A47] px-1 shrink-0">
          ↓
        </span>

        <span className="px-2 py-1 bg-[#172016] text-[#C2D88C] font-semibold shrink-0">
          ENHANCED AUDIO
        </span>

      </div>

      {/* AI Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">

        <div className="p-2 bg-[#0E120E] border border-[#1E251B]">
          <div className="text-[9px] text-[#68745F]">
            MODEL
          </div>

          <div className="text-[#CBD4C2] font-semibold mt-1">
            LightweightSpectralUNet
          </div>
        </div>

        <div className="p-2 bg-[#0E120E] border border-[#1E251B]">
          <div className="text-[9px] text-[#68745F]">
            SNR IMPROVEMENT
          </div>

          <div className="text-[#A4BA75] font-semibold mt-1">
            {snrImprovement != null
              ? `+${snrImprovement.toFixed(2)} dB`
              : '--'}
          </div>
        </div>

        <div className="p-2 bg-[#0E120E] border border-[#1E251B]">
          <div className="text-[9px] text-[#68745F]">
            ENHANCEMENT LATENCY
          </div>

          <div className="text-[#CBD4C2] font-semibold mt-1">
            {metrics?.enhancement_latency_ms != null
              ? `${metrics.enhancement_latency_ms.toFixed(1)} ms`
              : '--'}
          </div>
        </div>

        <div className="p-2 bg-[#0E120E] border border-[#1E251B]">
          <div className="text-[9px] text-[#68745F]">
            SAMPLE RATE
          </div>

          <div className="text-[#CBD4C2] font-semibold mt-1">
            {waveform?.sample_rate
              ? `${waveform.sample_rate / 1000} kHz`
              : '16 kHz'}
          </div>
        </div>

      </div>

      {/* BEFORE / AFTER Waveform Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

        {/* BEFORE */}
        <div className="border border-[#1E251B] bg-[#0E120E]">

          <div className="px-3 py-2 bg-[#121712] border-b border-[#1E251B] flex items-center justify-between">

            <span className="font-bold text-[#D0D6CA] tracking-wide uppercase">
              BEFORE: NOISY INPUT
            </span>

            <span className="text-[10px] text-[#717E67]">
              BACKEND AUDIO
            </span>

          </div>

          <div className="h-44 relative bg-[#090C09]">

            <canvas
              ref={beforeCanvasRef}
              width={450}
              height={176}
              className="w-full h-full block"
            />

          </div>

          <div className="p-2 bg-[#0C100C] text-[10px] text-[#75826A] flex justify-between">

            <span>
              SOURCE: AI PIPELINE
            </span>

            <span>
              {noisySamples.length
                ? `${noisySamples.length} SAMPLES`
                : 'NO DATA'}
            </span>

          </div>

        </div>

        {/* AFTER */}
        <div className="border border-[#283622] bg-[#0E120E]">

          <div className="px-3 py-2 bg-[#141A13] border-b border-[#283622] flex items-center justify-between">

            <span className="font-bold text-[#E2E8DC] tracking-wide uppercase">
              AFTER: AI ENHANCED
            </span>

            <span className="text-[10px] text-[#A4BA75]">
              SPECTRAL U-NET
            </span>

          </div>

          <div className="h-44 relative bg-[#090C09]">

            <canvas
              ref={afterCanvasRef}
              width={450}
              height={176}
              className="w-full h-full block"
            />

          </div>

          <div className="p-2 bg-[#0C100C] text-[10px] text-[#75826A] flex justify-between">

            <span>
              MODEL: LightweightSpectralUNet
            </span>

            <span>
              {enhancedSamples.length
                ? `${enhancedSamples.length} SAMPLES`
                : 'NO DATA'}
            </span>

          </div>

        </div>

      </div>

    </section>
  );
};