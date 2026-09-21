import React, { useState } from 'react';
import { Terminal, RefreshCw, Trash2 } from 'lucide-react';

interface LogEntry {
  id: string;
  time: string;
  subsystem: string;
  level: 'INFO' | 'DEBUG' | 'WARN' | 'ERROR';
  message: string;
}

export const SystemLogsPanel: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: '1',
      time: '10:14:02.115',
      subsystem: 'AUDIO_RECORDER',
      level: 'INFO',
      message: 'MediaStream audio context initialized. Sample rate: 48000 Hz. Buffer size: 2048.',
    },
    {
      id: '2',
      time: '10:14:02.128',
      subsystem: 'ANALYZER',
      level: 'DEBUG',
      message: 'FFT analyzer node bound to live microphone input with Hanning windowing.',
    },
    {
      id: '3',
      time: '10:14:03.450',
      subsystem: 'DATASET_ORCHESTRATOR',
      level: 'INFO',
      message: 'Loaded dataset manifest from dataset_builder.py. Found 6 active corpora.',
    },
    {
      id: '4',
      time: '10:14:04.012',
      subsystem: 'VALIDATION',
      level: 'INFO',
      message: 'Leakage checks executed: 0 speaker overlaps between train/val/test splits.',
    },
    {
      id: '5',
      time: '10:14:05.801',
      subsystem: 'API_CLIENT',
      level: 'WARN',
      message: 'NIRVAN backend endpoint POST /api/audio/process standby. Waiting for user dispatch.',
    },
  ]);

  const [filterLevel, setFilterLevel] = useState<string>('ALL');

  const filteredLogs = logs.filter((log) => {
    if (filterLevel === 'ALL') return true;
    return log.level === filterLevel;
  });

  const handleClear = () => {
    setLogs([]);
  };

  return (
    <div className="bg-[#0B0E0B] border border-[#232B20] p-3 font-mono text-xs flex flex-col space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between pb-2 border-b border-[#1F261C]">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 bg-[#69754B]"></span>
          <span className="font-bold text-[#E2E6DF] tracking-wider uppercase">
            SYSTEM TELEMETRY &amp; DSP EXECUTION LOGS
          </span>
          <span className="text-[10px] text-[#717C67]">[STREAM LOG JOURNAL]</span>
        </div>

        <div className="flex items-center space-x-2">
          {/* Level Filter */}
          <div className="flex items-center space-x-1 bg-[#0E120E] border border-[#1E251B] p-0.5 text-[10px]">
            {['ALL', 'INFO', 'DEBUG', 'WARN', 'ERROR'].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setFilterLevel(lvl)}
                className={`px-2 py-0.5 font-semibold ${
                  filterLevel === lvl
                    ? 'bg-[#242E20] text-[#E8ECE5] border border-[#48563E]'
                    : 'text-[#6C7862] hover:text-[#B6C2AB]'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          <button
            onClick={handleClear}
            className="flex items-center space-x-1 px-2.5 py-1 bg-[#121612] border border-[#20271D] text-[#7C8775] hover:text-[#CBD4C2] text-[10px] cursor-pointer"
          >
            <Trash2 className="w-3 h-3" />
            <span>CLEAR</span>
          </button>
        </div>
      </div>

      {/* Log Console Window */}
      <div className="bg-[#070A07] border border-[#182016] p-2.5 font-mono text-[11px] h-80 overflow-y-auto space-y-1.5">
        {filteredLogs.length === 0 ? (
          <div className="text-center py-12 text-[#4E5A47]">NO AUDIT LOGS RECORDED</div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} className="flex items-start space-x-2 leading-relaxed">
              <span className="text-[#55634B] select-none shrink-0">[{log.time}]</span>
              <span
                className={`px-1.5 py-0.2 text-[9px] font-bold border shrink-0 ${
                  log.level === 'INFO'
                    ? 'bg-[#152014] border-[#2C3E26] text-[#A4BA75]'
                    : log.level === 'DEBUG'
                    ? 'bg-[#101712] border-[#202D1D] text-[#78957F]'
                    : log.level === 'WARN'
                    ? 'bg-[#242013] border-[#524422] text-[#D8C775]'
                    : 'bg-[#291414] border-[#5E2626] text-[#E08A8A]'
                }`}
              >
                {log.level}
              </span>
              <span className="text-[#879475] font-semibold shrink-0">[{log.subsystem}]</span>
              <span className="text-[#CAD0C2]">{log.message}</span>
            </div>
          ))
        )}
      </div>

      {/* Footer Info */}
      <div className="flex items-center justify-between text-[10px] text-[#69755F] pt-1">
        <span>LOG CHANNEL: IPC / DEV_SERVER / WEB_AUDIO</span>
        <span>BUFFER RETENTION: 1000 FRAMES</span>
      </div>
    </div>
  );
};
