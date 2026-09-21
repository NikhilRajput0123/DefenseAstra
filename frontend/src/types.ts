export type DataSourceName =
  | 'CMU Arctic'
  | 'Internet Archive'
  | 'ESC-50'
  | 'MAD Dataset'
  | 'STRIX Datasets'
  | 'Helicopter WAVs';

export type DataSourceStatus = 'READY' | 'STAGING' | 'PROCESSING' | 'ERROR' | 'NOT CONNECTED';

export interface DataSourceItem {
  id: string;
  source: DataSourceName;
  status: DataSourceStatus;
  type: string;
  files: string; // e.g. "--" when unavailable
  staging: string;
  description: string;
  moduleRef?: string;
}

export type QualityStatus = 'PASSED' | 'RUNNING' | 'WARNING' | 'FAILED' | 'NOT RUN';

export interface QualityStep {
  id: string;
  name: 'LEAKAGE CHECKS' | 'AUTOMATED VALIDATION' | 'DATASET REPORT';
  module: string;
  status: QualityStatus;
  description: string;
  checksDetail?: string[];
  lastRun?: string;
}

export type AudioSignalControl = 'INPUT' | 'MIXED' | 'PROCESSED';

export type AnalysisTab = 'WAVEFORM' | 'SPECTROGRAM' | 'SPECTRUM';

export interface LiveSignalMetrics {
  signalLevel: string; // e.g. "-18.2 dBFS" or "--"
  snr: string; // e.g. "--" or real calculated
  frame: string; // e.g. "1024" or "--"
  buffer: string; // e.g. "4096 samples" or "--"
  processingStatus: string; // "ACTIVE" | "IDLE" | "STANDBY" | "--"
}

export interface SnrChannelData {
  name: 'CLEAN AUDIO' | 'NOISE AUDIO' | 'MIXED AUDIO';
  snr: string; // e.g. "--"
  source: string; // e.g. "CMU Arctic" or "--"
  duration: string; // e.g. "--"
  status: string; // e.g. "WAITING FOR INPUT" or "READY"
  waveformSamples?: Float32Array;
}

export interface ProcessingPipelineNode {
  id: string;
  label: string;
  moduleFile?: string;
  subtext?: string;
}
