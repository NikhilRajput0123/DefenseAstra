import React, { useRef, useState } from 'react';
import { Upload, AlertCircle, CheckCircle2, Play, Pause } from 'lucide-react';

export interface NoiseOption {
  id: string;
  name: string;
  connected: boolean;
  type: string;
}

interface NoiseSelectionPanelProps {
  onNoiseLoaded: (noiseBuffer: AudioBuffer | null, noiseBlob: Blob | null, name: string) => void;
  targetSnr: number;
  onTargetSnrChange: (snr: number) => void;
  hasCleanAudio: boolean;
}

export const NoiseSelectionPanel: React.FC<NoiseSelectionPanelProps> = ({
  onNoiseLoaded,
  targetSnr,
  onTargetSnrChange,
  hasCleanAudio,
}) => {
  const [selectedNoiseId, setSelectedNoiseId] = useState<string>('custom');
  const [customFileName, setCustomFileName] = useState<string | null>(null);
  const [customAudioBuffer, setCustomAudioBuffer] = useState<AudioBuffer | null>(null);
  const [isPlayingNoise, setIsPlayingNoise] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

  const noiseOptions: NoiseOption[] = [
    { id: 'engine', name: 'ENGINE / VEHICLE', connected: false, type: 'Mechanical Combustion' },
    { id: 'rotor', name: 'HELICOPTER / ROTOR', connected: false, type: 'Blade-Pass Harmonics' },
    { id: 'wind', name: 'WIND', connected: false, type: 'Turbulent Flow' },
    { id: 'explosion', name: 'EXPLOSION', connected: false, type: 'Impulsive Shock' },
    { id: 'impulsive', name: 'IMPULSIVE NOISE', connected: false, type: 'Transient Acoustic' },
    { id: 'environmental', name: 'ENVIRONMENTAL', connected: false, type: 'Ambient Background' },
    { id: 'custom', name: 'CUSTOM WAV', connected: customAudioBuffer !== null, type: 'Local Audio File' },
  ];

  const handleSelectPredefined = (option: NoiseOption) => {
    setSelectedNoiseId(option.id);
    if (!option.connected && option.id !== 'custom') {
      // Predefined asset not connected
      onNoiseLoaded(null, null, option.name);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const decoded = await audioCtx.decodeAudioData(arrayBuffer);
      setCustomAudioBuffer(decoded);
      setCustomFileName(file.name);
      setSelectedNoiseId('custom');

      onNoiseLoaded(decoded, file, file.name);
    } catch (err) {
      console.error('Error decoding local noise WAV file:', err);
      alert('Unable to decode uploaded audio file. Please ensure it is a valid .wav or audio format.');
    }
  };

  const togglePlayNoise = () => {
    if (!customAudioBuffer) return;

    if (isPlayingNoise) {
      try {
        sourceNodeRef.current?.stop();
        sourceNodeRef.current?.disconnect();
      } catch {
        /* ignore */
      }
      setIsPlayingNoise(false);
      return;
    }

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = audioContextRef.current || new AudioCtx();
    audioContextRef.current = ctx;

    const source = ctx.createBufferSource();
    source.buffer = customAudioBuffer;
    source.loop = true;
    source.connect(ctx.destination);
    source.start();

    sourceNodeRef.current = source;
    setIsPlayingNoise(true);

    source.onended = () => {
      setIsPlayingNoise(false);
    };
  };

  const snrPresets = [-5, 0, 5, 10, 15, 20];

  const selectedOption = noiseOptions.find((o) => o.id === selectedNoiseId);

  return (
    <div className="bg-[#0B0E0B] border border-[#232B20] p-3 font-mono text-xs flex flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between pb-2 mb-3 border-b border-[#1F261C]">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 bg-[#69754B]"></span>
          <span className="font-bold text-[#E2E6DF] tracking-wider uppercase">
            ADD NOISE &amp; TARGET SNR
          </span>
          <span className="text-[10px] text-[#717C67]">[ACOUSTIC PERTURBATION LAYER]</span>
        </div>

        {/* Upload Noise Button */}
        <button
          id="btn-upload-noise-wav"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center space-x-1.5 px-3 py-1 bg-[#192218] border border-[#374730] text-[#CBD4C2] hover:bg-[#223020] text-xs font-semibold uppercase transition-colors cursor-pointer"
        >
          <Upload className="w-3.5 h-3.5 text-[#A4BA75]" />
          <span>UPLOAD NOISE WAV</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,.wav"
          onChange={handleFileUpload}
          className="hidden"
        />
      </div>

      {/* Noise Source Selector Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5 mb-3">
        {noiseOptions.map((opt) => {
          const isSelected = selectedNoiseId === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => handleSelectPredefined(opt)}
              className={`p-2 border text-left flex flex-col justify-between transition-colors ${
                isSelected
                  ? 'bg-[#1C251A] border-[#879260] text-[#E8ECE5]'
                  : 'bg-[#0E120E] border-[#20271D] text-[#86927C] hover:border-[#384632]'
              }`}
            >
              <div>
                <div className="text-[9px] text-[#55634B] uppercase truncate">{opt.type}</div>
                <div className="font-bold text-[10px] text-[#D0D6CA] mt-0.5 leading-tight truncate">
                  {opt.name}
                </div>
              </div>

              <div className="mt-2 pt-1 border-t border-[#192017] flex items-center justify-between text-[8px]">
                {opt.connected ? (
                  <span className="text-[#A4BA75] font-semibold flex items-center space-x-0.5">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    <span>LOADED</span>
                  </span>
                ) : (
                  <span className="text-[#8A6342] font-semibold flex items-center space-x-0.5">
                    <AlertCircle className="w-2.5 h-2.5" />
                    <span>NOT CONNECTED</span>
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Noise Status Banner */}
      <div className="p-2 mb-3 bg-[#0E120E] border border-[#1E251B] flex flex-wrap items-center justify-between text-[11px]">
        <div className="flex items-center space-x-2">
          <span className="text-[#6D7A64]">SELECTED NOISE:</span>
          <span className="font-bold text-[#D0D6CA]">{selectedOption?.name}</span>
          {customFileName && selectedNoiseId === 'custom' && (
            <span className="text-[10px] text-[#A4BA75]">({customFileName})</span>
          )}
        </div>

        <div className="flex items-center space-x-3">
          {selectedOption && !selectedOption.connected ? (
            <span className="text-[10px] px-2 py-0.5 bg-[#251A14] border border-[#482F22] text-[#D89B75] font-semibold">
              NOT CONNECTED — UPLOAD LOCAL WAV TO INGEST NOISE
            </span>
          ) : (
            <div className="flex items-center space-x-2">
              <span className="text-[10px] px-2 py-0.5 bg-[#152014] border border-[#2C3E26] text-[#A4BA75] font-semibold">
                ACTUAL AUDIO LOADED
              </span>
              <button
                onClick={togglePlayNoise}
                className="flex items-center space-x-1 px-2 py-0.5 bg-[#172016] border border-[#30402A] text-[#CBD4C2] hover:text-[#E8ECE5] text-[10px] cursor-pointer"
              >
                {isPlayingNoise ? <Pause className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5" />}
                <span>{isPlayingNoise ? 'STOP' : 'AUDITION NOISE'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Target SNR Control Section */}
      <div className="p-3 bg-[#0E120E] border border-[#1E251B] flex flex-col space-y-2">
        <div className="flex flex-wrap items-center justify-between text-[11px]">
          <div className="flex items-center space-x-2">
            <span className="text-[#6D7A64] uppercase font-bold">TARGET SNR:</span>
            <span className="text-base font-bold text-[#C2D88C] font-mono">
              {targetSnr > 0 ? `+${targetSnr}` : targetSnr} dB
            </span>
          </div>

          {/* SNR Preset Buttons */}
          <div className="flex items-center space-x-1">
            {snrPresets.map((val) => (
              <button
                key={val}
                onClick={() => onTargetSnrChange(val)}
                className={`px-2.5 py-1 text-[10px] font-semibold border transition-colors cursor-pointer ${
                  targetSnr === val
                    ? 'bg-[#2E3727] border-[#5A6D4C] text-[#E8ECE5]'
                    : 'bg-[#121612] border-[#22291F] text-[#78856F] hover:text-[#B6C2AB]'
                }`}
              >
                {val > 0 ? `+${val} dB` : `${val} dB`}
              </button>
            ))}
          </div>
        </div>

        {/* Freeform Slider */}
        <div className="flex items-center space-x-3 pt-1">
          <span className="text-[10px] text-[#55634B]">-10 dB</span>
          <input
            type="range"
            min="-10"
            max="30"
            step="1"
            value={targetSnr}
            onChange={(e) => onTargetSnrChange(Number(e.target.value))}
            className="flex-1 accent-[#7D8C61] cursor-pointer h-1.5 bg-[#1B2319]"
          />
          <span className="text-[10px] text-[#55634B]">+30 dB</span>
        </div>

        {/* Flow Representation */}
        <div className="flex items-center justify-center p-2 bg-[#090C09] border border-[#182016] text-[10px] text-[#86927C] space-x-2">
          <span className={hasCleanAudio ? 'text-[#A4BA75] font-semibold' : 'text-[#586450]'}>
            CLEAN AUDIO
          </span>
          <span className="text-[#4E5A47]">+</span>
          <span
            className={
              selectedOption?.connected ? 'text-[#A4BA75] font-semibold' : 'text-[#8A6342] font-semibold'
            }
          >
            NOISE AUDIO ({selectedOption?.connected ? 'READY' : 'NOT CONNECTED'})
          </span>
          <span className="text-[#4E5A47]">↓</span>
          <span className="text-[#C2D88C] font-bold">
            MIXED AUDIO (@ {targetSnr > 0 ? `+${targetSnr}` : targetSnr} dB SNR)
          </span>
        </div>
      </div>
    </div>
  );
};
