import React, { useState } from 'react';
import { AUDIO_PROCESSING_FLOW_NODES } from '../data/pipelineData';

interface AudioProcessingFlowProps {
  isRunning: boolean;
}

export const AudioProcessingFlow: React.FC<AudioProcessingFlowProps> = ({ isRunning }) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string>('n1');

  const nodeDetails: Record<string, { title: string; desc: string; specs: string[] }> = {
    n1: {
      title: 'AUDIO INPUT',
      desc: 'Raw acoustic ingest stream accepting clean speech, environmental sound, or live hardware transducer line-in.',
      specs: ['Format: 16-bit / 32-bit float PCM', 'Channels: Mono / Multi-channel', 'Sampling: 16.0 kHz / 44.1 kHz']
    },
    n2: {
      title: 'AUDIO BUFFER',
      desc: 'Ring buffer / Circular FIFO queue managing windowed frame packetization with configurable hop sizes.',
      specs: ['Buffer Size: 2048 samples', 'Hop Size: 512 samples (75% overlap)', 'Window Function: Periodic Hanning']
    },
    n3: {
      title: 'PRE-PROCESSING',
      desc: 'High-pass baseline correction cutting sub-audible mechanical rumble, DC drift, and amplitude standardization.',
      specs: ['Cutoff: 80 Hz (-18 dB/oct)', 'Filter Type: Butterworth 2nd Order', 'Normalization: Peak -1.0 dBFS']
    },
    n4: {
      title: 'SIGNAL ANALYSIS',
      desc: 'Short-Time Fourier Transform (STFT) calculating complex spectral coefficients, spectral centroid, and flux.',
      specs: ['Transform: 2048-point STFT', 'Resolution: 21.5 Hz / bin', 'Metrics: Crest factor & Spectral Flux']
    },
    n5: {
      title: 'NOISE CHARACTERIZATION',
      desc: 'Estimates stationary noise floor and non-stationary transient bursts to inform SNR pair mixing models.',
      specs: ['Tracking: Min-statistics noise floor', 'Smoothing: Exponential averaging', 'SNR Target: Dynamic range [-10 dB to +30 dB]']
    },
    n6: {
      title: 'AUDIO PROCESSING',
      desc: 'Core DSP execution utilizing mix_audio.py and audio_utils.py for parametric filtering and calibrated level mixing.',
      specs: ['Modules: mix_audio.py, audio_utils.py', 'Latency: Zero-lookahead stream mode', 'Dynamic Range: Controlled gain staging']
    },
    n7: {
      title: 'SIGNAL RECONSTRUCTION',
      desc: 'Inverse Short-Time Fourier Transform (ISTFT) and overlap-add synthesis restoring continuous time-domain signal.',
      specs: ['Method: Weighted Overlap-Add (WOLA)', 'Phase: Consistent phase synthesis', 'Reconstruction Error: < -96 dB']
    },
    n8: {
      title: 'OUTPUT AUDIO',
      desc: 'Standardized, calibrated audio stream exported to analysis sinks or disk staging for neural network training.',
      specs: ['Target Format: 16 kHz Mono PCM WAV', 'Bit Depth: 16-bit signed integer', 'Metadata: BWF chunk timestamped']
    }
  };

  const currentDetail = nodeDetails[selectedNodeId] || nodeDetails.n1;

  return (
    <section className="bg-[#0B0E0B] border border-[#232B20] p-3 font-mono text-xs">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-[#1F261C]">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 bg-[#69754B]"></span>
          <span className="font-bold text-[#E2E6DF] tracking-wider uppercase">
            AUDIO PROCESSING FLOW
          </span>
          <span className="text-[10px] text-[#717C67]">
            [END-TO-END DSP EXECUTION PATH]
          </span>
        </div>
        <div className="text-[10px] text-[#76826B]">
          STATE: <span className={isRunning ? 'text-[#A4BA75] font-semibold' : 'text-[#626E59]'}>{isRunning ? 'FLOWING' : 'READY'}</span>
        </div>
      </div>

      {/* Linear Technical Node Chain */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-1 overflow-x-auto pb-2">
        {AUDIO_PROCESSING_FLOW_NODES.map((node, index) => {
          const isSelected = selectedNodeId === node.id;
          const isLast = index === AUDIO_PROCESSING_FLOW_NODES.length - 1;

          return (
            <React.Fragment key={node.id}>
              {/* Node Card */}
              <button
                id={`flow-node-${node.id}`}
                onClick={() => setSelectedNodeId(node.id)}
                className={`flex-1 min-w-[110px] p-2.5 text-left border transition-all ${
                  isSelected
                    ? 'bg-[#1D241A] border-[#879260] text-[#E8ECE5]'
                    : 'bg-[#0E120E] border-[#22291F] text-[#8C9881] hover:border-[#3B4734] hover:text-[#C4CEBC]'
                }`}
              >
                <div className="text-[9px] text-[#606D56] font-semibold mb-0.5">
                  STEP 0{index + 1}
                </div>
                <div className="font-bold text-[11px] uppercase tracking-tight text-[#D3D9CE]">
                  {node.label}
                </div>
                <div className="text-[9px] text-[#78856F] mt-1 leading-tight truncate">
                  {node.subtext}
                </div>
              </button>

              {/* Connector */}
              {!isLast && (
                <div className="hidden lg:flex items-center justify-center px-1 text-[#3B4734]">
                  →
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Selected Node Spec Inspector */}
      <div className="mt-3 p-3 bg-[#0E120E] border border-[#20271D]">
        <div className="flex flex-wrap items-center justify-between pb-1.5 mb-2 border-b border-[#1A2218]">
          <span className="font-bold text-[#CBD2C4] text-[11px] uppercase">
            SPECIFICATION INSPECTOR: {currentDetail.title}
          </span>
          <span className="text-[10px] text-[#6A7660]">MODULE ID: {selectedNodeId.toUpperCase()}</span>
        </div>
        <p className="text-[11px] text-[#93A087] mb-2 leading-relaxed">
          {currentDetail.desc}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
          {currentDetail.specs.map((s, idx) => (
            <div key={idx} className="bg-[#090C09] px-2 py-1 border border-[#1A2218] text-[10px] text-[#839177]">
              • {s}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
