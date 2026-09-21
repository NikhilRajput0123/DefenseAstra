import React, { useEffect, useRef, useState } from 'react';
import { useAudioSession } from '../context/AudioSessionContext';

interface LiveAudioPanelProps {
  isRunning: boolean;
}

type DisplayMode = 'INPUT' | 'MIXED' | 'PROCESSED';

export const LiveAudioPanel: React.FC<LiveAudioPanelProps> = ({
  isRunning,
}) => {
  const { processingResponse } = useAudioSession();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [activeControl, setActiveControl] =
    useState<DisplayMode>('INPUT');

  const waveform =
    processingResponse?.waveform ?? null;

  const metrics =
    processingResponse?.metrics ?? null;

  const noisySamples =
    waveform?.noisy?.samples ?? [];

  const enhancedSamples =
    waveform?.enhanced?.samples ?? [];

  const selectedSamples =
    activeControl === 'PROCESSED'
      ? enhancedSamples
      : noisySamples;

  const selectedLabel =
    activeControl === 'PROCESSED'
      ? 'AI ENHANCED'
      : activeControl === 'MIXED'
        ? 'MIXED / NOISY INPUT'
        : 'NOISY INPUT';

  const signalLevel = (() => {
    const samples =
      selectedSamples;

    if (!samples.length) {
      return '--';
    }

    let sumSquares = 0;

    const step = Math.max(
      1,
      Math.floor(samples.length / 4096)
    );

    let count = 0;

    for (
      let i = 0;
      i < samples.length;
      i += step
    ) {
      const value =
        Number(samples[i]) || 0;

      sumSquares +=
        value * value;

      count++;
    }

    if (!count) {
      return '--';
    }

    const rms =
      Math.sqrt(
        sumSquares / count
      );

    if (rms <= 0) {
      return '-∞ dBFS';
    }

    const db =
      20 * Math.log10(rms);

    return `${db.toFixed(1)} dBFS`;
  })();

  const snrValue =
    activeControl === 'PROCESSED'
      ? metrics?.snr_after != null
        ? `${metrics.snr_after.toFixed(2)} dB`
        : '--'
      : metrics?.snr_before != null
        ? `${metrics.snr_before.toFixed(2)} dB`
        : '--';

  const frameCount =
    selectedSamples.length
      ? selectedSamples.length.toString()
      : '--';

  const bufferSize =
    selectedSamples.length
      ? `${selectedSamples.length} samples`
      : '--';

  const procStatus =
    processingResponse
      ? 'AI ACTIVE'
      : isRunning
        ? 'PROCESSING'
        : 'IDLE';

  /*
   * ============================================================
   * DRAW GRID
   * ============================================================
   */

  const drawGrid = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ) => {
    ctx.fillStyle = '#0D100C';

    ctx.fillRect(
      0,
      0,
      width,
      height
    );

    ctx.strokeStyle = '#181F17';
    ctx.lineWidth = 1;

    const horizontalDivs = 4;

    for (
      let i = 0;
      i <= horizontalDivs;
      i++
    ) {
      const y =
        Math.round(
          (i / horizontalDivs) *
            height
        );

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

    const verticalDivs = 8;

    for (
      let j = 0;
      j <= verticalDivs;
      j++
    ) {
      const x =
        Math.round(
          (j / verticalDivs) *
            width
        );

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

    const midY =
      height / 2;

    ctx.strokeStyle =
      '#283325';

    ctx.lineWidth = 1;

    ctx.setLineDash([
      4,
      4,
    ]);

    ctx.beginPath();

    ctx.moveTo(
      0,
      midY
    );

    ctx.lineTo(
      width,
      midY
    );

    ctx.stroke();

    ctx.setLineDash([]);
  };

  /*
   * ============================================================
   * DRAW BACKEND WAVEFORM
   * ============================================================
   */

  const drawWaveform = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    data: number[]
  ) => {
    if (!data.length) {
      return;
    }

    const midY =
      height / 2;

    ctx.strokeStyle =
      activeControl === 'PROCESSED'
        ? '#A4BA75'
        : '#879260';

    ctx.lineWidth = 1.25;

    ctx.beginPath();

    /*
     * Backend sends the complete waveform.
     * Downsample only for canvas rendering.
     * Original backend samples remain untouched.
     */
    const maxPoints = 3000;

    const step =
      Math.max(
        1,
        Math.ceil(
          data.length / maxPoints
        )
      );

    const points =
      Math.ceil(
        data.length / step
      );

    const sliceWidth =
      width /
      Math.max(
        1,
        points - 1
      );

    let pointIndex = 0;

    for (
      let i = 0;
      i < data.length;
      i += step
    ) {
      const value =
        Number(data[i]) || 0;

      const v =
        Math.max(
          -1,
          Math.min(
            1,
            value
          )
        );

      const y =
        midY -
        v *
          (height * 0.44);

      const x =
        pointIndex *
        sliceWidth;

      if (pointIndex === 0) {
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
   * EMPTY STATE
   * ============================================================
   */

  const drawEmptyState = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ) => {
    const midY =
      height / 2;

    ctx.strokeStyle =
      '#323D2E';

    ctx.lineWidth = 1;

    ctx.beginPath();

    ctx.moveTo(
      0,
      midY
    );

    ctx.lineTo(
      width,
      midY
    );

    ctx.stroke();

    ctx.fillStyle =
      '#4E5A47';

    ctx.font =
      '11px "JetBrains Mono", monospace';

    ctx.textAlign =
      'center';

    ctx.textBaseline =
      'middle';

    ctx.fillText(
      'WAITING FOR AI AUDIO ANALYSIS',
      width / 2,
      midY - 14
    );

    ctx.fillStyle =
      '#3F493A';

    ctx.font =
      '10px "JetBrains Mono", monospace';

    ctx.fillText(
      'PROCESS AUDIO TO LOAD BACKEND WAVEFORM',
      width / 2,
      midY + 8
    );
  };

  /*
   * ============================================================
   * RENDER BACKEND WAVEFORM
   * ============================================================
   */

  useEffect(() => {
    const canvas =
      canvasRef.current;

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

    drawGrid(
      ctx,
      width,
      height
    );

    if (
      selectedSamples.length
    ) {
      drawWaveform(
        ctx,
        width,
        height,
        selectedSamples
      );

      /*
       * AI source label
       */
      ctx.fillStyle =
        'rgba(13, 16, 12, 0.88)';

      ctx.fillRect(
        width - 145,
        8,
        135,
        22
      );

      ctx.strokeStyle =
        '#303A2C';

      ctx.strokeRect(
        width - 145,
        8,
        135,
        22
      );

      ctx.fillStyle =
        activeControl === 'PROCESSED'
          ? '#A4BA75'
          : '#6D7763';

      ctx.font =
        '10px "JetBrains Mono", monospace';

      ctx.textAlign =
        'center';

      ctx.textBaseline =
        'middle';

      ctx.fillText(
        selectedLabel,
        width - 77,
        19
      );
    } else {
      drawEmptyState(
        ctx,
        width,
        height
      );
    }
  }, [
    processingResponse,
    activeControl,
    selectedSamples,
  ]);

  /*
   * ============================================================
   * UI
   * ============================================================
   */

  return (
    <section className="bg-[#0B0E0B] border border-[#232B20] flex flex-col font-mono text-xs">

      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between px-3 py-2 bg-[#0F130F] border-b border-[#1F261C]">

        <div className="flex items-center space-x-2">

          <span className="w-2 h-2 bg-[#69754B]" />

          <span className="font-bold text-[#E2E6DF] tracking-wider uppercase">
            AUDIO SIGNAL
          </span>

          <span className="text-[10px] text-[#717C67]">
            [BACKEND WAVEFORM]
          </span>

        </div>

        {/* Display Controls */}
        <div className="flex items-center space-x-1 bg-[#090C09] border border-[#232B20] p-0.5">

          <button
            id="btn-ctrl-input"
            onClick={() =>
              setActiveControl('INPUT')
            }
            className={`px-3 py-1 text-[11px] font-semibold transition-colors ${
              activeControl === 'INPUT'
                ? 'bg-[#2E3727] text-[#E8ECE5] border border-[#48563E]'
                : 'text-[#6C7862] hover:text-[#B6C2AB]'
            }`}
          >
            INPUT
          </button>

          <button
            id="btn-ctrl-mixed"
            onClick={() =>
              setActiveControl('MIXED')
            }
            className={`px-3 py-1 text-[11px] font-semibold transition-colors ${
              activeControl === 'MIXED'
                ? 'bg-[#2E3727] text-[#E8ECE5] border border-[#48563E]'
                : 'text-[#6C7862] hover:text-[#B6C2AB]'
            }`}
          >
            MIXED
          </button>

          <button
            id="btn-ctrl-processed"
            onClick={() =>
              setActiveControl('PROCESSED')
            }
            className={`px-3 py-1 text-[11px] font-semibold transition-colors ${
              activeControl === 'PROCESSED'
                ? 'bg-[#2E3727] text-[#E8ECE5] border border-[#48563E]'
                : 'text-[#6C7862] hover:text-[#B6C2AB]'
            }`}
          >
            PROCESSED
          </button>

        </div>

      </div>

      {/* Engineering Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-[#192017] border-b border-[#1F261C] text-[11px]">

        <div className="bg-[#0D100C] px-3 py-2">

          <div className="text-[#6D7763] text-[10px] uppercase">
            SIGNAL LEVEL
          </div>

          <div className="font-bold text-[#D0D6CA] mt-0.5">
            {signalLevel}
          </div>

        </div>

        <div className="bg-[#0D100C] px-3 py-2">

          <div className="text-[#6D7763] text-[10px] uppercase">
            SNR
          </div>

          <div className="font-bold text-[#D0D6CA] mt-0.5">
            {snrValue}
          </div>

        </div>

        <div className="bg-[#0D100C] px-3 py-2">

          <div className="text-[#6D7763] text-[10px] uppercase">
            SAMPLES
          </div>

          <div className="font-bold text-[#D0D6CA] mt-0.5">
            {frameCount}
          </div>

        </div>

        <div className="bg-[#0D100C] px-3 py-2">

          <div className="text-[#6D7763] text-[10px] uppercase">
            BUFFER
          </div>

          <div className="font-bold text-[#D0D6CA] mt-0.5">
            {bufferSize}
          </div>

        </div>

        <div className="bg-[#0D100C] px-3 py-2 col-span-2 sm:col-span-1">

          <div className="text-[#6D7763] text-[10px] uppercase">
            PROCESSING STATUS
          </div>

          <div
            className={`font-bold mt-0.5 ${
              procStatus === 'AI ACTIVE'
                ? 'text-[#A4BA75]'
                : procStatus === 'PROCESSING'
                  ? 'text-[#A4BA75]'
                  : 'text-[#6D7763]'
            }`}
          >
            {procStatus}
          </div>

        </div>

      </div>

      {/* Main Waveform Canvas */}
      <div className="relative p-2 bg-[#090C09]">

        <div className="relative flex">

          {/* Amplitude Y-Axis Labels */}
          <div className="flex flex-col justify-between text-[9px] text-[#55604C] pr-2 py-1 select-none w-10 text-right shrink-0">

            <span>+1.00</span>

            <span>+0.50</span>

            <span className="text-[#7A886D]">
              0.00
            </span>

            <span>-0.50</span>

            <span>-1.00</span>

          </div>

          {/* Canvas */}
          <div className="relative flex-1 h-56 sm:h-64 border border-[#1C241A] overflow-hidden bg-[#0D100C]">

            <canvas
              ref={canvasRef}
              width={900}
              height={260}
              className="w-full h-full block"
            />

          </div>

        </div>

        {/* Time X-Axis Scale */}
        <div className="flex justify-between text-[9px] text-[#55604C] pl-12 pr-1 pt-1 select-none">

          <span>0.0 ms</span>

          <span>25%</span>

          <span>50%</span>

          <span>75%</span>

          <span>100%</span>

        </div>

        {/* Backend Information */}
        <div className="flex justify-between items-center px-12 pt-2 text-[9px] text-[#55604C]">

          <span>
            SOURCE: BACKEND AI PIPELINE
          </span>

          <span>
            {waveform?.sample_rate
              ? `${waveform.sample_rate} Hz`
              : '16 kHz'}
          </span>

        </div>

      </div>

    </section>
  );
};