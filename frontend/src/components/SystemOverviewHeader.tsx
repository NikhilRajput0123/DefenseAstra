import React, { useState } from 'react';
import { Mic, Volume2, VolumeX, Upload, Menu } from 'lucide-react';

interface HeaderProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  isRunning: boolean;
  onToggleRun: () => void;
  onToggleSidebar?: () => void;
}

export const SystemOverviewHeader: React.FC<HeaderProps> = ({
  currentTab,
  onSelectTab,
  isRunning,
  onToggleRun,
  onToggleSidebar,
}) => {
  const [signalType, setSignalType] =
    useState<'CLEAN_SPEECH' | 'CALIBRATION_1KHZ' | 'MIC_LIVE' | 'FILE_INPUT'>(
      'CLEAN_SPEECH'
    );

  const [volume, setVolume] = useState<number>(20);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  const fileInputRef =
    React.useRef<HTMLInputElement>(null);

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];

    if (file) {
      setSignalType('FILE_INPUT');
    }
  };

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
  };

  const toggleMute = () => {
    setIsMuted((previous) => !previous);
  };

  return (
    <header className="border-b border-[#232B20] bg-[#0A0D0A] text-[#D8DDD3] select-none font-mono text-xs shrink-0">

      {/* Top Banner with System Status Indicators */}
      <div className="flex flex-wrap items-center justify-between px-3 py-2 gap-y-2">

        {/* Title & Subtitle */}
        <div className="flex items-center space-x-3">

          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="p-1 text-[#78856F] hover:text-[#C2D88C] cursor-pointer lg:hidden"
              title="Toggle Navigation Menu"
            >
              <Menu className="w-4 h-4" />
            </button>
          )}

          <div className="flex items-center space-x-2">

            <span className="inline-block w-2.5 h-2.5 bg-[#69754B] border border-[#879260]" />

            <div>
              <div className="flex items-center space-x-2">

                <h1 className="text-xs sm:text-sm font-bold tracking-wider text-[#E8ECE5] uppercase font-mono">
                  NIRVAN DEFENCE AUDIO INTELLIGENCE
                </h1>

                <span className="hidden sm:inline-block px-1.5 py-0.2 bg-[#172016] border border-[#2D3F28] text-[9px] text-[#A4BA75] font-bold">
                  v2.8
                </span>

              </div>

              <p className="text-[10px] text-[#7C886F] tracking-tight">
                Audio Signal Processing &amp; Dataset Intelligence Workstation
              </p>
            </div>

          </div>
        </div>

        {/* System Status */}
        <div className="flex items-center flex-wrap gap-1.5 text-[10px]">

          <div className="flex items-center space-x-1 px-2 py-0.5 bg-[#101410] border border-[#232B20]">
            <span className="text-[#7C886F]">SYSTEM:</span>
            <span className="text-[#99A877] font-semibold">
              READY
            </span>
          </div>

          <div className="flex items-center space-x-1 px-2 py-0.5 bg-[#101410] border border-[#232B20]">
            <span className="text-[#7C886F]">AUDIO PIPELINE:</span>
            <span className="text-[#99A877] font-semibold">
              READY
            </span>
          </div>

          <div className="flex items-center space-x-1 px-2 py-0.5 bg-[#101410] border border-[#232B20]">
            <span className="text-[#7C886F]">DATASET PIPELINE:</span>
            <span className="text-[#99A877] font-semibold">
              READY
            </span>
          </div>

          <div className="flex items-center space-x-1 px-2 py-0.5 bg-[#101410] border border-[#232B20]">
            <span className="text-[#7C886F]">PROCESSING:</span>
            <span className="text-[#76806C] font-semibold">
              IDLE
            </span>
          </div>

        </div>

        {/* Audio Controls */}
        <div className="flex items-center space-x-2">

          {/* Signal Source Selector */}
          <div className="flex items-center space-x-1 bg-[#121612] border border-[#262D24] p-0.5 text-[9px]">

            <button
              onClick={() => setSignalType('CLEAN_SPEECH')}
              className={`px-1.5 py-0.5 transition-colors ${
                signalType === 'CLEAN_SPEECH'
                  ? 'bg-[#2E3628] text-[#E8ECE5]'
                  : 'text-[#7A8570] hover:text-[#C5CDC0]'
              }`}
            >
              SPEECH
            </button>

            <button
              onClick={() => setSignalType('CALIBRATION_1KHZ')}
              className={`px-1.5 py-0.5 transition-colors ${
                signalType === 'CALIBRATION_1KHZ'
                  ? 'bg-[#2E3628] text-[#E8ECE5]'
                  : 'text-[#7A8570] hover:text-[#C5CDC0]'
              }`}
            >
              1kHz CAL
            </button>

            <button
              onClick={() => setSignalType('MIC_LIVE')}
              className={`px-1.5 py-0.5 flex items-center space-x-1 transition-colors ${
                signalType === 'MIC_LIVE'
                  ? 'bg-[#2E3628] text-[#E8ECE5]'
                  : 'text-[#7A8570] hover:text-[#C5CDC0]'
              }`}
            >
              <Mic className="w-2.5 h-2.5" />
              <span>MIC</span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className={`px-1.5 py-0.5 flex items-center space-x-1 transition-colors ${
                signalType === 'FILE_INPUT'
                  ? 'bg-[#2E3628] text-[#E8ECE5]'
                  : 'text-[#7A8570] hover:text-[#C5CDC0]'
              }`}
            >
              <Upload className="w-2.5 h-2.5" />
              <span>FILE</span>
            </button>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="audio/*"
              className="hidden"
            />

          </div>

          {/* Volume / Monitor */}
          <div className="flex items-center space-x-1.5 bg-[#121612] border border-[#262D24] px-1.5 py-0.5">

            <button
              onClick={toggleMute}
              className="text-[#879260] hover:text-[#B1BE8A]"
              title={
                isMuted
                  ? 'Unmute Monitor'
                  : 'Mute Monitor'
              }
            >
              {isMuted ? (
                <VolumeX className="w-3 h-3 text-[#B85C5C]" />
              ) : (
                <Volume2 className="w-3 h-3" />
              )}
            </button>

            <input
              type="range"
              min="0"
              max="100"
              value={isMuted ? 0 : volume}
              onChange={(e) =>
                handleVolumeChange(
                  Number(e.target.value)
                )
              }
              className="w-12 h-1 accent-[#69754B] bg-[#22291F] cursor-pointer"
            />

            <span className="text-[9px] text-[#7A8570] w-5 text-right">
              {isMuted ? 'MUT' : `${volume}%`}
            </span>

          </div>

        </div>

      </div>
    </header>
  );
};