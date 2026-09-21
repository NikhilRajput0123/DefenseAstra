import React, { createContext, useContext, useState } from 'react';
import { RecordingMetadata } from '../services/audioRecorder';
import { ProcessAudioResponse } from '../services/nirvanApi';

interface AudioSessionContextType {
  // Clean speech
  cleanMetadata: RecordingMetadata | null;
  setCleanMetadata: React.Dispatch<
    React.SetStateAction<RecordingMetadata | null>
  >;

  // Noise
  noiseBuffer: AudioBuffer | null;
  setNoiseBuffer: React.Dispatch<
    React.SetStateAction<AudioBuffer | null>
  >;

  noiseBlob: Blob | null;
  setNoiseBlob: React.Dispatch<React.SetStateAction<Blob | null>>;

  noiseName: string;
  setNoiseName: React.Dispatch<React.SetStateAction<string>>;

  // SNR
  targetSnrDb: number;
  setTargetSnrDb: React.Dispatch<React.SetStateAction<number>>;

  actualSnrDb: number | null;
  setActualSnrDb: React.Dispatch<React.SetStateAction<number | null>>;

  // Mixed audio
  mixedBuffer: AudioBuffer | null;
  setMixedBuffer: React.Dispatch<
    React.SetStateAction<AudioBuffer | null>
  >;

  mixedBlob: Blob | null;
  setMixedBlob: React.Dispatch<React.SetStateAction<Blob | null>>;

  mixedUrl: string | null;
  setMixedUrl: React.Dispatch<React.SetStateAction<string | null>>;

  // Enhanced audio
  enhancedBuffer: AudioBuffer | null;
  setEnhancedBuffer: React.Dispatch<
    React.SetStateAction<AudioBuffer | null>
  >;

  enhancedUrl: string | null;
  setEnhancedUrl: React.Dispatch<React.SetStateAction<string | null>>;

  // Backend
  isBackendConnected: boolean;
  setIsBackendConnected: React.Dispatch<React.SetStateAction<boolean>>;

  // Complete backend response
  processingResponse: ProcessAudioResponse | null;
  setProcessingResponse: React.Dispatch<
    React.SetStateAction<ProcessAudioResponse | null>
  >;

  // Analysis source
  activeAnalysisSource: 'CLEAN' | 'MIXED' | 'ENHANCED';
  setActiveAnalysisSource: React.Dispatch<
    React.SetStateAction<'CLEAN' | 'MIXED' | 'ENHANCED'>
  >;
}

const AudioSessionContext =
  createContext<AudioSessionContextType | null>(null);

export const AudioSessionProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [cleanMetadata, setCleanMetadata] =
    useState<RecordingMetadata | null>(null);

  const [noiseBuffer, setNoiseBuffer] =
    useState<AudioBuffer | null>(null);

  const [noiseBlob, setNoiseBlob] =
    useState<Blob | null>(null);

  const [noiseName, setNoiseName] =
    useState<string>('ENGINE / VEHICLE');

  const [targetSnrDb, setTargetSnrDb] =
    useState<number>(10);

  const [actualSnrDb, setActualSnrDb] =
    useState<number | null>(null);

  const [mixedBuffer, setMixedBuffer] =
    useState<AudioBuffer | null>(null);

  const [mixedBlob, setMixedBlob] =
    useState<Blob | null>(null);

  const [mixedUrl, setMixedUrl] =
    useState<string | null>(null);

  const [enhancedBuffer, setEnhancedBuffer] =
    useState<AudioBuffer | null>(null);

  const [enhancedUrl, setEnhancedUrl] =
    useState<string | null>(null);

  const [isBackendConnected, setIsBackendConnected] =
    useState<boolean>(false);

  const [processingResponse, setProcessingResponse] =
    useState<ProcessAudioResponse | null>(null);

  const [activeAnalysisSource, setActiveAnalysisSource] =
    useState<'CLEAN' | 'MIXED' | 'ENHANCED'>('CLEAN');

  return (
    <AudioSessionContext.Provider
      value={{
        cleanMetadata,
        setCleanMetadata,

        noiseBuffer,
        setNoiseBuffer,

        noiseBlob,
        setNoiseBlob,

        noiseName,
        setNoiseName,

        targetSnrDb,
        setTargetSnrDb,

        actualSnrDb,
        setActualSnrDb,

        mixedBuffer,
        setMixedBuffer,

        mixedBlob,
        setMixedBlob,

        mixedUrl,
        setMixedUrl,

        enhancedBuffer,
        setEnhancedBuffer,

        enhancedUrl,
        setEnhancedUrl,

        isBackendConnected,
        setIsBackendConnected,

        processingResponse,
        setProcessingResponse,

        activeAnalysisSource,
        setActiveAnalysisSource,
      }}
    >
      {children}
    </AudioSessionContext.Provider>
  );
};

export const useAudioSession = (): AudioSessionContextType => {
  const context = useContext(AudioSessionContext);

  if (!context) {
    throw new Error(
      'useAudioSession must be used inside AudioSessionProvider'
    );
  }

  return context;
};