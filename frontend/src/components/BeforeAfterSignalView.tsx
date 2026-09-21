import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';

interface SignalTrack {
  title: string;
  subtext: string;
  audioBuffer: AudioBuffer | null;
  audioUrl: string | null;
  statusText: string;
  color: string;
}

interface BeforeAfterSignalViewProps {
  originalBuffer: AudioBuffer | null;
  originalUrl: string | null;
  mixedBuffer: AudioBuffer | null;
  mixedUrl: string | null;
  enhancedBuffer: AudioBuffer | null;
  enhancedUrl: string | null;
  isBackendConnected: boolean;
  onSelectActiveAudioForSpectrogram?: (
    buffer: AudioBuffer | null
  ) => void;
}

export const BeforeAfterSignalView: React.FC<BeforeAfterSignalViewProps> = ({
  originalBuffer,
  originalUrl,
  mixedBuffer,
  mixedUrl,
  enhancedBuffer,
  enhancedUrl,
  isBackendConnected,
  onSelectActiveAudioForSpectrogram,
}) => {
  const [playingTrackIndex, setPlayingTrackIndex] = useState<number | null>(
    null
  );

  const canvasRefs = [
    useRef<HTMLCanvasElement | null>(null),
    useRef<HTMLCanvasElement | null>(null),
    useRef<HTMLCanvasElement | null>(null),
  ];

  const audioRefs = [
    useRef<HTMLAudioElement | null>(null),
    useRef<HTMLAudioElement | null>(null),
    useRef<HTMLAudioElement | null>(null),
  ];

  const tracks: SignalTrack[] = [
    {
      title: '1. ORIGINAL AUDIO',
      subtext: 'CLEAN SPEECH RECORDING',
      audioBuffer: originalBuffer,
      audioUrl: originalUrl,
      statusText: originalBuffer
        ? 'AUTHENTIC RECORDED AUDIO'
        : 'NO RECORDED INPUT',
      color: '#A4BA75',
    },
    {
      title: '2. NOISY / MIXED AUDIO',
      subtext: 'CLEAN + CALIBRATED NOISE',
      audioBuffer: mixedBuffer,
      audioUrl: mixedUrl,
      statusText: mixedBuffer
        ? 'CALIBRATED SNR MIXTURE'
        : 'WAITING FOR NOISE INGESTION',
      color: '#C2D88C',
    },
    {
      title: '3. NIRVAN ENHANCED AUDIO',
      subtext: 'DEEP ACOUSTIC ENHANCEMENT',
      audioBuffer: enhancedBuffer,
      audioUrl: enhancedUrl,
      statusText: enhancedBuffer
        ? 'AI ENHANCEMENT COMPLETE'
        : isBackendConnected
        ? 'WAITING FOR AI PROCESSING'
        : 'WAITING FOR PROCESSING (BACKEND NOT CONNECTED)',
      color: '#E8ECE5',
    },
  ];

  // ---------------------------------------------------------------------------
  // Draw real waveform from the actual AudioBuffer
  // ---------------------------------------------------------------------------
  useEffect(() => {
    tracks.forEach((track, index) => {
      const canvas = canvasRefs[index].current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      // Background
      ctx.fillStyle = '#080C08';
      ctx.fillRect(0, 0, width, height);

      // Center line
      ctx.strokeStyle = '#182017';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      // No audio available
      if (!track.audioBuffer) {
        ctx.fillStyle = '#4D5845';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          track.statusText,
          width / 2,
          height / 2
        );
        return;
      }

      const channelData = track.audioBuffer.getChannelData(0);

      if (!channelData || channelData.length === 0) {
        ctx.fillStyle = '#4D5845';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('NO AUDIO SAMPLES', width / 2, height / 2);
        return;
      }

      const step = Math.max(
        1,
        Math.ceil(channelData.length / width)
      );

      const amp = height * 0.44;

      ctx.fillStyle = track.color;

      for (let i = 0; i < width; i++) {
        const start = i * step;
        const end = Math.min(start + step, channelData.length);

        if (start >= channelData.length) break;

        let min = 1;
        let max = -1;

        for (let j = start; j < end; j++) {
          const sample = channelData[j];

          if (sample < min) min = sample;
          if (sample > max) max = sample;
        }

        const yMin = height / 2 + min * amp;
        const yMax = height / 2 + max * amp;

        ctx.fillRect(
          i,
          yMin,
          1,
          Math.max(1, yMax - yMin)
        );
      }
    });
  }, [
    originalBuffer,
    mixedBuffer,
    enhancedBuffer,
    isBackendConnected,
  ]);

  // ---------------------------------------------------------------------------
  // Select enhanced audio by default when it becomes available
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (enhancedBuffer && onSelectActiveAudioForSpectrogram) {
      onSelectActiveAudioForSpectrogram(enhancedBuffer);
    }
  }, [enhancedBuffer, onSelectActiveAudioForSpectrogram]);

  // ---------------------------------------------------------------------------
  // Stop playback when URLs change / component unmounts
  // ---------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      audioRefs.forEach((ref) => {
        if (ref.current) {
          ref.current.pause();
          ref.current.currentTime = 0;
        }
      });
    };
  }, []);

  useEffect(() => {
    audioRefs.forEach((ref) => {
      if (ref.current) {
        ref.current.pause();
        ref.current.currentTime = 0;
      }
    });

    setPlayingTrackIndex(null);
  }, [originalUrl, mixedUrl, enhancedUrl]);

  // ---------------------------------------------------------------------------
  // Playback
  // ---------------------------------------------------------------------------
  const handlePlayToggle = async (index: number) => {
    const audioEl = audioRefs[index].current;

    if (!audioEl) return;

    if (playingTrackIndex === index) {
      audioEl.pause();
      setPlayingTrackIndex(null);
      return;
    }

    // Stop all other tracks
    audioRefs.forEach((ref, idx) => {
      if (idx !== index && ref.current) {
        ref.current.pause();
        ref.current.currentTime = 0;
      }
    });

    try {
      await audioEl.play();
      setPlayingTrackIndex(index);

      // Selecting the currently played signal also updates
      // the active spectrogram source.
      const selectedBuffer = tracks[index].audioBuffer;

      if (onSelectActiveAudioForSpectrogram) {
        onSelectActiveAudioForSpectrogram(selectedBuffer);
      }
    } catch (error) {
      console.error('Audio playback failed:', error);
      setPlayingTrackIndex(null);
    }
  };

  return (
    <div className="bg-[#0B0E0B] border border-[#232B20] p-3 font-mono text-xs flex flex-col">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between pb-2 mb-3 border-b border-[#1F261C]">

        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 bg-[#69754B]" />

          <span className="font-bold text-[#E2E6DF] tracking-wider uppercase">
            BEFORE / AFTER SIGNAL WORKBENCH
          </span>

          <span className="text-[10px] text-[#717C67]">
            [THREE-WAY SYNCHRONIZED COMPARISON]
          </span>
        </div>

        <div className="text-[10px] text-[#76846D]">
          BACKEND STATUS:{' '}

          <span
            className={
              isBackendConnected
                ? 'text-[#A4BA75] font-semibold'
                : 'text-[#8A6342] font-semibold'
            }
          >
            {isBackendConnected ? 'ACTIVE' : 'NOT CONNECTED'}
          </span>
        </div>
      </div>

      {/* Three Signal Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

        {tracks.map((track, idx) => (
          <div
            key={track.title}
            className="border border-[#1E251B] bg-[#0E120E] flex flex-col"
          >

            {/* Native audio */}
            {track.audioUrl && (
              <audio
                ref={audioRefs[idx]}
                src={track.audioUrl}
                preload="auto"
                onEnded={() => {
                  setPlayingTrackIndex(null);
                }}
                onError={() => {
                  setPlayingTrackIndex(null);
                }}
              />
            )}

            {/* Title */}
            <div className="px-3 py-2 bg-[#121612] border-b border-[#1E251B] flex items-center justify-between">

              <div>
                <div className="font-bold text-[#D0D6CA] tracking-wide uppercase text-[11px]">
                  {track.title}
                </div>

                <div className="text-[9px] text-[#707E67]">
                  {track.subtext}
                </div>
              </div>

              {/* Play */}
              {track.audioUrl ? (
                <button
                  id={`btn-play-track-${idx}`}
                  onClick={() => handlePlayToggle(idx)}
                  className="flex items-center space-x-1 px-2.5 py-1 bg-[#1A2419] border border-[#374C2E] text-[#C2D88C] hover:bg-[#233321] text-[10px] font-bold uppercase transition-colors cursor-pointer"
                >
                  {playingTrackIndex === idx ? (
                    <>
                      <Pause className="w-3 h-3 fill-current" />
                      <span>PAUSE</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3 h-3 fill-current" />
                      <span>PLAY</span>
                    </>
                  )}
                </button>
              ) : (
                <span className="text-[9px] px-2 py-0.5 bg-[#141814] text-[#55634D] border border-[#20271E]">
                  UNAVAILABLE
                </span>
              )}
            </div>

            {/* Waveform */}
            <div className="h-36 relative bg-[#080C08] border-b border-[#1A2218]">
              <canvas
                ref={canvasRefs[idx]}
                width={500}
                height={144}
                className="w-full h-full block"
              />
            </div>

            {/* Bottom status */}
            <div className="p-2 bg-[#0C100C] text-[10px] flex items-center justify-between">

              <span className="text-[#65735B]">
                {track.audioBuffer
                  ? `${track.audioBuffer.sampleRate} Hz | ${track.audioBuffer.numberOfChannels} CH`
                  : '--'}
              </span>

              <span
                className={`font-semibold text-[9px] truncate max-w-[180px] ${
                  track.audioBuffer
                    ? 'text-[#9CB074]'
                    : 'text-[#7D6B57]'
                }`}
              >
                {track.statusText}
              </span>

            </div>
          </div>
        ))}

      </div>
    </div>
  );
};