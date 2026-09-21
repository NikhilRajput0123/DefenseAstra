import React, {
  useEffect,
  useRef,
  useState,
} from 'react';

import { AnalysisTab } from '../types';
import { useAudioSession } from '../context/AudioSessionContext';

interface TimeFrequencyAnalysisProps {
  isRunning: boolean;
  activeAudioBuffer?: AudioBuffer | null;
}

type SpectrogramMatrix = number[][];

export const TimeFrequencyAnalysis: React.FC<
  TimeFrequencyAnalysisProps
> = ({
  isRunning,
  activeAudioBuffer = null,
}) => {
  const [activeTab, setActiveTab] =
    useState<AnalysisTab>('SPECTROGRAM');

  const canvasRef =
    useRef<HTMLCanvasElement | null>(null);

  const {
    processingResponse,
    activeAnalysisSource,
  } = useAudioSession();

  /*
   * ============================================================
   * REAL BACKEND DATA ONLY
   * ============================================================
   */

  const waveform =
    processingResponse?.waveform ?? null;

  const spectrogram =
    processingResponse?.spectrogram ?? null;

  const metrics =
    processingResponse?.metrics ?? null;

  /*
   * IMPORTANT:
   * Backend waveform structure:
   *
   * waveform.noisy.samples
   * waveform.enhanced.samples
   *
   * Backend spectrogram structure:
   *
   * spectrogram.noisy.data
   * spectrogram.enhanced.data
   */

  const noisyWaveform =
    waveform?.noisy?.samples ?? [];

  const enhancedWaveform =
    waveform?.enhanced?.samples ?? [];

  const noisySpectrogram =
    spectrogram?.noisy?.data ?? [];

  const enhancedSpectrogram =
    spectrogram?.enhanced?.data ?? [];

  const sampleRate =
    waveform?.sample_rate ??
    spectrogram?.noisy?.sample_rate ??
    16000;

  /*
   * ============================================================
   * SOURCE SELECTION
   * ============================================================
   */

  const useEnhanced =
    activeAnalysisSource === 'ENHANCED';

  const currentWaveform =
    useEnhanced
      ? enhancedWaveform
      : noisyWaveform;

  const currentSpectrogram: SpectrogramMatrix =
    useEnhanced
      ? enhancedSpectrogram
      : noisySpectrogram;

  /*
   * ============================================================
   * ANALYSIS STATUS
   * ============================================================
   */

  const hasBackendAnalysis =
    Boolean(processingResponse) &&
    (
      noisyWaveform.length > 0 ||
      enhancedWaveform.length > 0 ||
      noisySpectrogram.length > 0 ||
      enhancedSpectrogram.length > 0
    );

  const hasCurrentWaveform =
    currentWaveform.length > 0;

  const hasCurrentSpectrogram =
    currentSpectrogram.length > 0 &&
    currentSpectrogram[0]?.length > 0;

  /*
   * ============================================================
   * DEBUG
   * ============================================================
   */

  useEffect(() => {
    console.log(
      'NIRVAN SIGNAL ANALYSIS',
      {
        backendAvailable:
          Boolean(processingResponse),

        source:
          useEnhanced
            ? 'ENHANCED'
            : 'NOISY',

        noisyWaveformSamples:
          noisyWaveform.length,

        enhancedWaveformSamples:
          enhancedWaveform.length,

        noisySpectrogramRows:
          noisySpectrogram.length,

        noisySpectrogramColumns:
          noisySpectrogram[0]?.length ?? 0,

        enhancedSpectrogramRows:
          enhancedSpectrogram.length,

        enhancedSpectrogramColumns:
          enhancedSpectrogram[0]?.length ?? 0,

        sampleRate,
      }
    );
  }, [
    processingResponse,
    useEnhanced,
    noisyWaveform,
    enhancedWaveform,
    noisySpectrogram,
    enhancedSpectrogram,
    sampleRate,
  ]);

  /*
   * ============================================================
   * DRAW BACKGROUND
   * ============================================================
   */

  const drawBackground = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ) => {
    ctx.fillStyle = '#0B0E0B';

    ctx.fillRect(
      0,
      0,
      width,
      height
    );

    ctx.strokeStyle = '#182017';

    ctx.lineWidth = 1;

    for (
      let y = 0;
      y <= height;
      y += 40
    ) {
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
      let x = 0;
      x <= width;
      x += 100
    ) {
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
  };

  /*
   * ============================================================
   * DRAW WAITING MESSAGE
   * ============================================================
   */

  const drawWaiting = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    message: string
  ) => {
    drawBackground(
      ctx,
      width,
      height
    );

    ctx.fillStyle = '#4D5845';

    ctx.font =
      '11px "JetBrains Mono", monospace';

    ctx.textAlign = 'center';

    ctx.textBaseline = 'middle';

    ctx.fillText(
      message,
      width / 2,
      height / 2
    );
  };

  /*
   * ============================================================
   * DRAW WAVEFORM
   * ============================================================
   */

  const drawWaveform = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    data: number[]
  ) => {
    drawBackground(
      ctx,
      width,
      height
    );

    if (!data.length) {
      drawWaiting(
        ctx,
        width,
        height,
        'WAVEFORM — WAITING FOR AI AUDIO'
      );

      return;
    }

    const midY =
      height / 2;

    /*
     * Center line
     */

    ctx.strokeStyle =
      '#263126';

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

    /*
     * Downsample waveform to canvas width.
     */

    const samplesPerPixel =
      Math.max(
        1,
        Math.floor(
          data.length / width
        )
      );

    ctx.strokeStyle =
      '#A3B17D';

    ctx.lineWidth = 1.25;

    ctx.beginPath();

    for (
      let x = 0;
      x < width;
      x++
    ) {
      const start =
        x *
        samplesPerPixel;

      const end =
        Math.min(
          start +
            samplesPerPixel,
          data.length
        );

      let min = 1;

      let max = -1;

      for (
        let i = start;
        i < end;
        i++
      ) {
        const value =
          Number(
            data[i]
          ) || 0;

        min =
          Math.min(
            min,
            value
          );

        max =
          Math.max(
            max,
            value
          );
      }

      const yMax =
        midY -
        max *
          (height * 0.43);

      const yMin =
        midY -
        min *
          (height * 0.43);

      if (x === 0) {
        ctx.moveTo(
          x,
          yMax
        );
      } else {
        ctx.lineTo(
          x,
          yMax
        );
      }

      ctx.lineTo(
        x,
        yMin
      );
    }

    ctx.stroke();

    /*
     * Source label
     */

    ctx.fillStyle =
      'rgba(11, 14, 11, 0.82)';

    ctx.fillRect(
      8,
      8,
      220,
      18
    );

    ctx.fillStyle =
      '#A4BA75';

    ctx.font =
      '10px "JetBrains Mono", monospace';

    ctx.textAlign = 'left';

    ctx.textBaseline = 'middle';

    ctx.fillText(
      `${sampleRate} Hz | ${
        useEnhanced
          ? 'AI ENHANCED'
          : 'NOISY INPUT'
      }`,
      14,
      17
    );
  };

  /*
   * ============================================================
   * DRAW SPECTRUM
   * ============================================================
   *
   * Uses backend spectrogram data.
   *
   * No browser FFT / DFT.
   */

  const drawSpectrum = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    data: SpectrogramMatrix
  ) => {
    drawBackground(
      ctx,
      width,
      height
    );

    if (
      !data.length ||
      !data[0]?.length
    ) {
      drawWaiting(
        ctx,
        width,
        height,
        'SPECTRUM — WAITING FOR AI ANALYSIS'
      );

      return;
    }

    /*
     * Calculate average energy for every
     * frequency bin from backend STFT.
     */

    const points =
      Math.min(
        512,
        data.length
      );

    const values =
      new Array<number>(
        points
      ).fill(0);

    for (
      let k = 0;
      k < points;
      k++
    ) {
      const row =
        data[k];

      if (
        !Array.isArray(row) ||
        row.length === 0
      ) {
        continue;
      }

      let energy = 0;

      for (
        let i = 0;
        i < row.length;
        i++
      ) {
        const value =
          Number(
            row[i]
          );

        if (
          Number.isFinite(value)
        ) {
          energy +=
            value * value;
        }
      }

      values[k] =
        Math.sqrt(
          energy /
            Math.max(
              row.length,
              1
            )
        );
    }

    let maxValue = 0;

    for (
      const value of values
    ) {
      maxValue =
        Math.max(
          maxValue,
          value
        );
    }

    maxValue =
      Math.max(
        maxValue,
        1e-8
      );

    /*
     * Filled spectrum.
     */

    ctx.beginPath();

    for (
      let i = 0;
      i < values.length;
      i++
    ) {
      const normalized =
        values[i] /
        maxValue;

      const x =
        (
          i /
          Math.max(
            values.length - 1,
            1
          )
        ) *
        width;

      const y =
        height -
        normalized *
          (height * 0.85);

      if (i === 0) {
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
    }

    ctx.lineTo(
      width,
      height
    );

    ctx.lineTo(
      0,
      height
    );

    ctx.closePath();

    ctx.fillStyle =
      'rgba(105, 117, 75, 0.20)';

    ctx.fill();

    /*
     * Spectrum line.
     */

    ctx.beginPath();

    for (
      let i = 0;
      i < values.length;
      i++
    ) {
      const normalized =
        values[i] /
        maxValue;

      const x =
        (
          i /
          Math.max(
            values.length - 1,
            1
          )
        ) *
        width;

      const y =
        height -
        normalized *
          (height * 0.85);

      if (i === 0) {
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
    }

    ctx.strokeStyle =
      '#8E9C6B';

    ctx.lineWidth = 1.5;

    ctx.stroke();

    /*
     * Header.
     */

    ctx.fillStyle =
      'rgba(11, 14, 11, 0.82)';

    ctx.fillRect(
      8,
      8,
      230,
      18
    );

    ctx.fillStyle =
      '#A4BA75';

    ctx.font =
      '10px "JetBrains Mono", monospace';

    ctx.textAlign = 'left';

    ctx.textBaseline = 'middle';

    ctx.fillText(
      `${sampleRate} Hz | ${
        useEnhanced
          ? 'AI ENHANCED SPECTRUM'
          : 'NOISY INPUT SPECTRUM'
      }`,
      14,
      17
    );
  };

  /*
   * ============================================================
   * DRAW SPECTROGRAM
   * ============================================================
   *
   * IMPORTANT:
   * Uses ONLY backend spectrogram data.
   *
   * No browser-side STFT/DFT fallback.
   */

  const drawSpectrogram = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    data: SpectrogramMatrix
  ) => {
    drawBackground(
      ctx,
      width,
      height
    );

    if (
      !data.length ||
      !data[0]?.length
    ) {
      drawWaiting(
        ctx,
        width,
        height,
        'SPECTROGRAM — WAITING FOR AI ANALYSIS'
      );

      return;
    }

    const rows =
      data.length;

    let cols = 0;

    for (
      const row of data
    ) {
      if (
        Array.isArray(row)
      ) {
        cols =
          Math.max(
            cols,
            row.length
          );
      }
    }

    if (
      rows === 0 ||
      cols === 0
    ) {
      drawWaiting(
        ctx,
        width,
        height,
        'SPECTROGRAM — NO BACKEND DATA'
      );

      return;
    }

    /*
     * Find dynamic min/max from
     * actual backend spectrogram.
     */

    let minValue =
      Number.POSITIVE_INFINITY;

    let maxValue =
      Number.NEGATIVE_INFINITY;

    for (
      let y = 0;
      y < rows;
      y++
    ) {
      const row =
        data[y];

      if (
        !Array.isArray(row)
      ) {
        continue;
      }

      for (
        let x = 0;
        x < row.length;
        x++
      ) {
        const value =
          Number(
            row[x]
          );

        if (
          !Number.isFinite(value)
        ) {
          continue;
        }

        minValue =
          Math.min(
            minValue,
            value
          );

        maxValue =
          Math.max(
            maxValue,
            value
          );
      }
    }

    if (
      !Number.isFinite(
        minValue
      ) ||
      !Number.isFinite(
        maxValue
      )
    ) {
      drawWaiting(
        ctx,
        width,
        height,
        'SPECTROGRAM — INVALID BACKEND DATA'
      );

      return;
    }

    const range =
      Math.max(
        maxValue -
          minValue,
        1e-8
      );

    const cellWidth =
      width / cols;

    const cellHeight =
      height / rows;

    /*
     * Render spectrogram.
     *
     * Backend STFT orientation:
     * rows = frequency bins
     * cols = time frames
     *
     * Low frequency appears at bottom.
     */

    for (
      let y = 0;
      y < rows;
      y++
    ) {
      const row =
        data[y];

      if (
        !Array.isArray(row)
      ) {
        continue;
      }

      for (
        let x = 0;
        x < cols;
        x++
      ) {
        const rawValue =
          Number(
            row[x]
          );

        if (
          !Number.isFinite(
            rawValue
          )
        ) {
          continue;
        }

        const normalized =
          Math.min(
            Math.max(
              (
                rawValue -
                minValue
              ) /
                range,
              0
            ),
            1
          );

        /*
         * NIRVAN green/olive
         * spectral intensity.
         */

        const r =
          Math.round(
            8 +
              normalized *
                150
          );

        const g =
          Math.round(
            15 +
              normalized *
                190
          );

        const b =
          Math.round(
            10 +
              normalized *
                145
          );

        ctx.fillStyle =
          `rgb(${r}, ${g}, ${b})`;

        ctx.fillRect(
          x * cellWidth,
          height -
            (y + 1) *
              cellHeight,
          Math.ceil(
            cellWidth
          ) + 1,
          Math.ceil(
            cellHeight
          ) + 1
        );
      }
    }

    /*
     * Frequency reference lines.
     */

    ctx.strokeStyle =
      'rgba(40, 52, 38, 0.45)';

    ctx.lineWidth = 1;

    const nyquist =
      sampleRate / 2;

    const freqMarkers = [
      1000,
      2000,
      4000,
      8000,
    ];

    freqMarkers.forEach(
      (frequency) => {
        if (
          frequency >=
          nyquist
        ) {
          return;
        }

        const y =
          height -
          (
            frequency /
            nyquist
          ) *
            height;

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

        ctx.fillStyle =
          'rgba(130, 145, 110, 0.65)';

        ctx.font =
          '9px "JetBrains Mono", monospace';

        ctx.textAlign = 'left';

        ctx.textBaseline =
          'middle';

        ctx.fillText(
          `${frequency / 1000} kHz`,
          6,
          y - 4
        );
      }
    );

    /*
     * Header label.
     */

    ctx.fillStyle =
      'rgba(11, 14, 11, 0.80)';

    ctx.fillRect(
      8,
      8,
      280,
      18
    );

    ctx.fillStyle =
      '#A4BA75';

    ctx.font =
      '10px "JetBrains Mono", monospace';

    ctx.textAlign = 'left';

    ctx.textBaseline = 'middle';

    ctx.fillText(
      `${sampleRate} Hz | ${
        useEnhanced
          ? 'AI ENHANCED SPECTROGRAM'
          : 'NOISY INPUT SPECTROGRAM'
      }`,
      14,
      17
    );
  };

  /*
   * ============================================================
   * CANVAS RENDER
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

    if (
      activeTab ===
      'SPECTROGRAM'
    ) {
      drawSpectrogram(
        ctx,
        width,
        height,
        currentSpectrogram
      );

      return;
    }

    if (
      activeTab ===
      'SPECTRUM'
    ) {
      drawSpectrum(
        ctx,
        width,
        height,
        currentSpectrogram
      );

      return;
    }

    if (
      activeTab ===
      'WAVEFORM'
    ) {
      drawWaveform(
        ctx,
        width,
        height,
        currentWaveform
      );
    }
  }, [
    activeTab,
    currentWaveform,
    currentSpectrogram,
    sampleRate,
    useEnhanced,
  ]);

  /*
   * ============================================================
   * LABELS
   * ============================================================
   */

  const sourceLabel =
    hasBackendAnalysis
      ? useEnhanced
        ? 'AI ENHANCED'
        : 'NOISY INPUT'
      : activeAudioBuffer
        ? 'AUDIO SELECTED'
        : 'WAITING FOR AI';

  const spectrogramSource =
    hasCurrentSpectrogram
      ? 'BACKEND STFT'
      : 'WAITING';

  /*
   * ============================================================
   * RENDER
   * ============================================================
   */

  return (
    <section className="bg-[#0B0E0B] border border-[#232B20] flex flex-col font-mono text-xs">

      {/* HEADER */}

      <div className="flex flex-wrap items-center justify-between px-3 py-2 bg-[#0F130F] border-b border-[#1F261C]">

        <div className="flex items-center space-x-2">

          <span className="w-2 h-2 bg-[#69754B]" />

          <span className="font-bold text-[#E2E6DF] tracking-wider uppercase">
            TIME-FREQUENCY ANALYSIS
          </span>

          <span className="text-[10px] text-[#717C67]">
            [NIRVAN AI BACKEND]
          </span>

        </div>

        <div className="text-[10px] text-[#76846D]">

          SOURCE:{' '}

          <span
            className={
              hasBackendAnalysis
                ? 'text-[#A4BA75] font-semibold'
                : 'text-[#7D6B57] font-semibold'
            }
          >
            {sourceLabel}
          </span>

        </div>

      </div>

      {/* AI METRICS */}

      {processingResponse && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-[#1F261C] border-b border-[#1F261C]">

          <div className="bg-[#0B100B] px-3 py-2">
            <div className="text-[8px] tracking-[0.12em] text-[#5F6B57]">
              SNR BEFORE
            </div>

            <div className="mt-1 text-[11px] font-bold text-[#9EAA8D]">
              {metrics?.snr_before !== null &&
              metrics?.snr_before !== undefined
                ? `${metrics.snr_before.toFixed(2)} dB`
                : '--'}
            </div>
          </div>

          <div className="bg-[#0B100B] px-3 py-2">
            <div className="text-[8px] tracking-[0.12em] text-[#5F6B57]">
              SNR AFTER
            </div>

            <div className="mt-1 text-[11px] font-bold text-[#9EAA8D]">
              {metrics?.snr_after !== null &&
              metrics?.snr_after !== undefined
                ? `${metrics.snr_after.toFixed(2)} dB`
                : '--'}
            </div>
          </div>

          <div className="bg-[#0B100B] px-3 py-2">
            <div className="text-[8px] tracking-[0.12em] text-[#5F6B57]">
              IMPROVEMENT
            </div>

            <div className="mt-1 text-[11px] font-bold text-[#A4BA75]">
              {metrics?.snr_improvement !== null &&
              metrics?.snr_improvement !== undefined
                ? `${metrics.snr_improvement >= 0 ? '+' : ''}${metrics.snr_improvement.toFixed(2)} dB`
                : '--'}
            </div>
          </div>

          <div className="bg-[#0B100B] px-3 py-2">
            <div className="text-[8px] tracking-[0.12em] text-[#5F6B57]">
              SI-SNR
            </div>

            <div className="mt-1 text-[11px] font-bold text-[#9EAA8D]">
              {metrics?.si_snr_after !== null &&
              metrics?.si_snr_after !== undefined
                ? `${metrics.si_snr_after.toFixed(2)} dB`
                : '--'}
            </div>
          </div>

          <div className="bg-[#0B100B] px-3 py-2">
            <div className="text-[8px] tracking-[0.12em] text-[#5F6B57]">
              STOI
            </div>

            <div className="mt-1 text-[11px] font-bold text-[#9EAA8D]">
              {metrics?.stoi_after !== null &&
              metrics?.stoi_after !== undefined
                ? metrics.stoi_after.toFixed(3)
                : '--'}
            </div>
          </div>

        </div>
      )}

      {/* TABS */}

      <div className="flex items-center justify-between px-3 py-2 bg-[#0F130F] border-b border-[#1F261C]">

        <span className="text-[9px] text-[#5F6B57]">

          {processingResponse
            ? `${sampleRate} Hz | ${
                useEnhanced
                  ? 'AI ENHANCED'
                  : 'NOISY INPUT'
              }`
            : activeAudioBuffer
              ? `${activeAudioBuffer.duration.toFixed(2)}s | ${
                  activeAudioBuffer.sampleRate
                } Hz | ${
                  activeAudioBuffer.numberOfChannels
                } CH`
              : 'NO AUDIO SELECTED'}

        </span>

        <div className="flex items-center space-x-1">

          <span className="text-[8px] text-[#5F6B57] mr-2">
            {activeTab === 'SPECTROGRAM'
              ? `SOURCE: ${spectrogramSource}`
              : ''}
          </span>

          <div className="flex items-center space-x-1 bg-[#090C09] border border-[#232B20] p-0.5">

            <button
              id="tab-tf-waveform"
              onClick={() =>
                setActiveTab('WAVEFORM')
              }
              className={`px-3 py-1 text-[11px] font-semibold transition-colors ${
                activeTab === 'WAVEFORM'
                  ? 'bg-[#2E3727] text-[#E8ECE5] border border-[#48563E]'
                  : 'text-[#6C7862] hover:text-[#B6C2AB]'
              }`}
            >
              WAVEFORM
            </button>

            <button
              id="tab-tf-spectrogram"
              onClick={() =>
                setActiveTab('SPECTROGRAM')
              }
              className={`px-3 py-1 text-[11px] font-semibold transition-colors ${
                activeTab === 'SPECTROGRAM'
                  ? 'bg-[#2E3727] text-[#E8ECE5] border border-[#48563E]'
                  : 'text-[#6C7862] hover:text-[#B6C2AB]'
              }`}
            >
              SPECTROGRAM
            </button>

            <button
              id="tab-tf-spectrum"
              onClick={() =>
                setActiveTab('SPECTRUM')
              }
              className={`px-3 py-1 text-[11px] font-semibold transition-colors ${
                activeTab === 'SPECTRUM'
                  ? 'bg-[#2E3727] text-[#E8ECE5] border border-[#48563E]'
                  : 'text-[#6C7862] hover:text-[#B6C2AB]'
              }`}
            >
              SPECTRUM
            </button>

          </div>

        </div>

      </div>

      {/* CANVAS */}

      <div className="p-2 bg-[#090C09]">

        <div className="relative h-64 sm:h-72 border border-[#1C241A] overflow-hidden bg-[#0B0E0B]">

          <canvas
            ref={canvasRef}
            width={900}
            height={288}
            className="w-full h-full block"
          />

          <div className="absolute top-2 right-2 px-2 py-0.5 bg-[#0D120D]/90 border border-[#263122] text-[10px] text-[#869473]">

            {activeTab === 'SPECTROGRAM'
              ? `BACKEND STFT | ${spectrogramSource}`
              : processingResponse
                ? 'AI PIPELINE | BACKEND DATA'
                : 'WAITING FOR AI PROCESSING'}

          </div>

        </div>

        {/* FREQUENCY AXIS */}

        <div className="flex justify-between text-[9px] text-[#55604C] px-2 pt-1 select-none">

          <span>0 Hz</span>

          <span>1.0 kHz</span>

          <span>2.0 kHz</span>

          <span>4.0 kHz</span>

          <span>6.0 kHz</span>

          <span>8.0 kHz</span>

        </div>

      </div>

    </section>
  );
};