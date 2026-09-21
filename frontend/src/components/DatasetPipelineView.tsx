import React, { useState } from 'react';

interface ModuleRef {
  name: string;
  file: string;
  stage: string;
  desc: string;
  status: 'READY' | 'STAGING' | 'STANDBY';
}

export const DatasetPipelineView: React.FC = () => {
  const [activeModule, setActiveModule] = useState<string>('dataset_builder.py');

  const pipelineStages = [
    { id: 'p1', name: 'DATA SOURCES', file: 'Raw Corpora', desc: 'CMU Arctic, Internet Archive, ESC-50, MAD, STRIX, Helicopter WAVs' },
    { id: 'p2', name: 'DATA ACQUISITION', file: 'dataset_builder.py', desc: 'Ingestion, decompression, and raw directory hashing' },
    { id: 'p3', name: 'DATASET ORCHESTRATOR', file: 'dataset_builder.py', desc: 'Master pipeline task scheduler and stage dependency resolution' },
    { id: 'p4', name: 'AUDIO STANDARDIZATION', file: 'dataset_builder.py', desc: 'Resampling to 16kHz/44.1kHz, mono conversion, bit depth normalization' },
    { id: 'p5', name: 'SNR PAIR MIXING', file: 'dataset_builder.py', desc: 'Calibrated acoustic overlay of clean speech with noise profiles across target SNR dB' },
    { id: 'p6', name: 'LEAKAGE-FREE SPLITS', file: 'dataset_builder.py', desc: 'Disjoint speaker ID and acoustic environment partitioning (Train/Val/Test)' },
    { id: 'p7', name: 'RAW METADATA', file: 'dataset_builder.py', desc: 'Initial source manifest extracting sample rate, duration, and utterance tags' },
    { id: 'p8', name: 'DATASET METADATA', file: 'dataset_builder.py', desc: 'Unified JSON-Lines schema containing pairs, SNR, split label, and checksums' },
    { id: 'p9', name: 'QUALITY REPORTING', file: 'dataset_builder.py', desc: 'Automated verification, leakage audits, and class distribution export' }
  ];

  const specializedIntegrators: ModuleRef[] = [
    {
      name: 'MAD Integrator',
      file: 'integrate_mad.py',
      stage: 'Acquisition / Ingestion',
      desc: 'Parses Motor Audio Dataset structure, extracts mechanical signatures, and aligns rotor/engine timestamps.',
      status: 'READY'
    },
    {
      name: 'Explosion Integrator',
      file: 'integrate_explosion.py',
      stage: 'Acoustic Events',
      desc: 'Preprocesses blast overpressure recordings, normalizes high-dynamic range impulses, and annotates shock fronts.',
      status: 'READY'
    },
    {
      name: 'Drone Integrator',
      file: 'integrate_drone.py',
      stage: 'Target Acoustics',
      desc: 'Isolates UAV propeller blade-pass harmonics and motor motor RPM whine against ambient outdoor wind noise.',
      status: 'READY'
    },
    {
      name: 'Helicopter Converter',
      file: 'convert_helicopter.py',
      stage: 'Rotorcraft Conversion',
      desc: 'Converts legacy helicopter multi-track audio to standardized 16-bit mono format with blade-pass indexation.',
      status: 'READY'
    },
    {
      name: 'Basic Audio Mixer',
      file: 'mix_audio.py',
      stage: 'Acoustic DSP',
      desc: 'Mathematical linear combination of clean and noise signals scaled according to exact dB SNR equations.',
      status: 'READY'
    },
    {
      name: 'Audio Utilities',
      file: 'audio_utils.py',
      stage: 'Signal Processing',
      desc: 'Core DSP library: STFT/ISTFT, Butterworth high-pass/low-pass filtering, RMS power calculations, peak limiter.',
      status: 'READY'
    }
  ];

  return (
    <section className="bg-[#0B0E0B] border border-[#232B20] p-3 font-mono text-xs">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-[#1F261C]">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 bg-[#69754B]"></span>
          <span className="font-bold text-[#E2E6DF] tracking-wider uppercase">
            DATASET PIPELINE ARCHITECTURE
          </span>
          <span className="text-[10px] text-[#717C67]">
            [END-TO-END DATASET ORCHESTRATION]
          </span>
        </div>
        <div className="text-[10px] text-[#859275]">
          PRIMARY ORCHESTRATOR: <span className="text-[#C2D88C] font-semibold">dataset_builder.py</span>
        </div>
      </div>

      {/* Vertical / Linear Technical Flow Chart */}
      <div className="space-y-1.5 mb-4">
        {pipelineStages.map((stage, idx) => (
          <div
            key={stage.id}
            className="flex flex-col md:flex-row md:items-center justify-between p-2 bg-[#0E120E] border border-[#20271D] hover:border-[#333E2E] transition-colors"
          >
            <div className="flex items-center space-x-3">
              <span className="text-[10px] text-[#5B6750] w-6">0{idx + 1}</span>
              <span className="font-bold text-[11px] text-[#D8DED3] tracking-wide">
                {stage.name}
              </span>
              <span className="text-[10px] px-2 py-0.5 bg-[#141A13] border border-[#263122] text-[#8E9C7B]">
                [{stage.file}]
              </span>
            </div>
            <div className="text-[10px] text-[#7B8870] mt-1 md:mt-0 max-w-xl truncate">
              {stage.desc}
            </div>
          </div>
        ))}
      </div>

      {/* Specialized Integrator Modules Grid */}
      <div className="border-t border-[#1F261C] pt-3">
        <div className="font-bold text-[#C5CEBD] text-[11px] uppercase tracking-wider mb-2">
          PIPELINE INTEGRATORS &amp; UTILITY SCRIPTS
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {specializedIntegrators.map((mod) => (
            <div
              key={mod.name}
              className="p-2.5 bg-[#0D100C] border border-[#1E251B] flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-[#E2E6DF] text-[11px]">{mod.name}</span>
                  <span className="text-[9px] px-1.5 py-0.5 bg-[#172016] border border-[#2C3B27] text-[#93A575]">
                    {mod.status}
                  </span>
                </div>
                <div className="text-[10px] text-[#869477] font-semibold mb-1">
                  File: <code className="text-[#B9C6A2]">{mod.file}</code>
                </div>
                <p className="text-[10px] text-[#75806B] leading-relaxed">
                  {mod.desc}
                </p>
              </div>
              <div className="mt-2 pt-1 border-t border-[#171D15] text-[9px] text-[#55614C]">
                Stage: {mod.stage}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
