import React, { useEffect } from 'react';

import { AudioInputPanel } from './AudioInputPanel';
import { NoiseSelectionPanel } from './NoiseSelectionPanel';
import { BeforeAfterSignalView } from './BeforeAfterSignalView';
import { NirvanProcessingSection } from './NirvanProcessingSection';
import { TimeFrequencyAnalysis } from './TimeFrequencyAnalysis';

import { RecordingMetadata } from '../services/audioRecorder';

import {
  ProcessAudioResponse,
  mixAudioBuffers,
  audioBufferToWavBlob,
} from '../services/nirvanApi';

import { useAudioSession } from '../context/AudioSessionContext';

type AnalysisSource = 'CLEAN' | 'MIXED' | 'ENHANCED';

export const LiveAudioWorkspace: React.FC = () => {
  // ============================================================
  // SHARED AUDIO SESSION STATE
  // ============================================================

  const {
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
  } = useAudioSession();

  // ============================================================
  // CURRENT ANALYSIS BUFFER
  // ============================================================

  const activeAnalysisBuffer =
    activeAnalysisSource === 'CLEAN'
      ? cleanMetadata?.audioBuffer ?? null
      : activeAnalysisSource === 'MIXED'
        ? mixedBuffer
        : enhancedBuffer;

  // ============================================================
  // CREATE MIXED AUDIO
  // ============================================================

  useEffect(() => {
    if (!cleanMetadata?.audioBuffer || !noiseBuffer) {
      setMixedBuffer(null);
      setMixedBlob(null);

      setMixedUrl((previousUrl) => {
        if (previousUrl) {
          URL.revokeObjectURL(previousUrl);
        }

        return null;
      });

      return;
    }

    let cancelled = false;

    try {
      const mixed = mixAudioBuffers(
        cleanMetadata.audioBuffer,
        noiseBuffer,
        targetSnrDb
      );

      const wavBlob = audioBufferToWavBlob(mixed);

      const url = URL.createObjectURL(wavBlob);

      if (cancelled) {
        URL.revokeObjectURL(url);
        return;
      }

      setMixedBuffer(mixed);
      setMixedBlob(wavBlob);
      setMixedUrl(url);

      // Automatically show mixed signal.
      setActiveAnalysisSource('MIXED');
    } catch (error) {
      console.error(
        'Client-side SNR mixing error:',
        error
      );

      setMixedBuffer(null);
      setMixedBlob(null);
      setMixedUrl(null);
    }

    return () => {
      cancelled = true;
    };
  }, [
    cleanMetadata?.audioBuffer,
    noiseBuffer,
    targetSnrDb,
    setMixedBuffer,
    setMixedBlob,
    setMixedUrl,
    setActiveAnalysisSource,
  ]);

  // ============================================================
  // BACKEND PROCESSING SUCCESS
  // ============================================================

  const handleProcessingSuccess = async (
    response: ProcessAudioResponse
  ) => {
    console.log(
      'NIRVAN processing response:',
      response
    );

    // Store complete backend response in shared context.
    setProcessingResponse(response);

    setIsBackendConnected(true);

    // Store actual SNR returned by backend.
    if (
      typeof response.actual_snr_db === 'number'
    ) {
      setActualSnrDb(response.actual_snr_db);
    }

    const backendEnhancedUrl =
      response?.audio?.enhanced?.url;

    if (!backendEnhancedUrl) {
      console.error(
        'Enhanced audio URL missing:',
        response
      );

      return;
    }

    setEnhancedUrl(backendEnhancedUrl);

    // ----------------------------------------------------------
    // Decode backend enhanced WAV
    // ----------------------------------------------------------

    try {
      const audioResponse =
        await fetch(backendEnhancedUrl);

      if (!audioResponse.ok) {
        throw new Error(
          `Could not fetch enhanced audio: ${audioResponse.status}`
        );
      }

      const arrayBuffer =
        await audioResponse.arrayBuffer();

      const AudioCtx =
        window.AudioContext ||
        (
          window as unknown as {
            webkitAudioContext: typeof AudioContext;
          }
        ).webkitAudioContext;

      const audioContext = new AudioCtx();

      const decoded =
        await audioContext.decodeAudioData(
          arrayBuffer
        );

      setEnhancedBuffer(decoded);

      // Automatically switch analysis to AI output.
      setActiveAnalysisSource('ENHANCED');

      await audioContext.close();
    } catch (error) {
      console.error(
        'Enhanced audio decode error:',
        error
      );
    }
  };

  // ============================================================
  // CLEAR EVERYTHING
  // ============================================================

  const handleClearAll = () => {
    setCleanMetadata(null);

    setNoiseBuffer(null);
    setNoiseBlob(null);
    setNoiseName('ENGINE / VEHICLE');

    setMixedBuffer(null);
    setMixedBlob(null);

    if (mixedUrl) {
      URL.revokeObjectURL(mixedUrl);
    }

    setMixedUrl(null);

    setEnhancedBuffer(null);
    setEnhancedUrl(null);

    setActualSnrDb(null);

    setProcessingResponse(null);

    setIsBackendConnected(false);

    setActiveAnalysisSource('CLEAN');
  };

  // ============================================================
  // NEW RECORDING / WAV UPLOAD
  // ============================================================

  const handleRecordingComplete = (
    metadata: RecordingMetadata
  ) => {
    setCleanMetadata(metadata);

    // Previous processing becomes invalid
    // when a new clean recording is loaded.
    setMixedBuffer(null);
    setMixedBlob(null);

    if (mixedUrl) {
      URL.revokeObjectURL(mixedUrl);
    }

    setMixedUrl(null);

    setEnhancedBuffer(null);
    setEnhancedUrl(null);

    setActualSnrDb(null);

    setProcessingResponse(null);

    setIsBackendConnected(false);

    setActiveAnalysisSource('CLEAN');
  };

  // ============================================================
  // NOISE LOADED
  // ============================================================

  const handleNoiseLoaded = (
    buffer: AudioBuffer | null,
    blob: Blob | null,
    name: string
  ) => {
    setNoiseBuffer(buffer);
    setNoiseBlob(blob);
    setNoiseName(name);

    // New noise means old enhancement is no longer valid.
    setEnhancedBuffer(null);
    setEnhancedUrl(null);

    setProcessingResponse(null);
    setActualSnrDb(null);

    setActiveAnalysisSource(
      buffer ? 'MIXED' : 'CLEAN'
    );
  };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="space-y-3 font-mono text-xs">

      {/* ======================================================
          WORKFLOW BANNER
      ====================================================== */}

      <div className="p-2.5 bg-[#0C100C] border border-[#232C20] flex items-center justify-between overflow-x-auto text-[11px]">

        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 bg-[#69754B] border border-[#879260]" />

          <span className="font-bold text-[#E2E6DF] uppercase tracking-wider">
            LIVE AUDIO WORKFLOW:
          </span>
        </div>

        <div className="flex items-center space-x-2 text-[10px]">

          <span
            className={`px-2 py-0.5 border ${
              cleanMetadata?.audioBuffer
                ? 'bg-[#152014] border-[#2C3E26] text-[#A4BA75]'
                : 'bg-[#121612] border-[#20271D] text-[#69755F]'
            }`}
          >
            1. RECORD / UPLOAD AUDIO
          </span>

          <span className="text-[#3A4633]">→</span>

          <span
            className={`px-2 py-0.5 border ${
              noiseBuffer
                ? 'bg-[#152014] border-[#2C3E26] text-[#A4BA75]'
                : 'bg-[#121612] border-[#20271D] text-[#69755F]'
            }`}
          >
            2. ADD / SELECT NOISE
          </span>

          <span className="text-[#3A4633]">→</span>

          <span
            className={`px-2 py-0.5 border ${
              mixedBuffer
                ? 'bg-[#152014] border-[#2C3E26] text-[#A4BA75]'
                : 'bg-[#121612] border-[#20271D] text-[#69755F]'
            }`}
          >
            3. TARGET SNR
          </span>

          <span className="text-[#3A4633]">→</span>

          <span
            className={`px-2 py-0.5 border ${
              enhancedBuffer
                ? 'bg-[#152014] border-[#2C3E26] text-[#A4BA75]'
                : 'bg-[#121612] border-[#20271D] text-[#69755F]'
            }`}
          >
            4. PROCESS WITH NIRVAN
          </span>

          <span className="text-[#3A4633]">→</span>

          <span
            className={`px-2 py-0.5 border ${
              enhancedBuffer
                ? 'bg-[#152014] border-[#2C3E26] text-[#A4BA75]'
                : 'bg-[#121612] border-[#20271D] text-[#69755F]'
            }`}
          >
            5. COMPARE RESULT
          </span>

        </div>
      </div>

      {/* ======================================================
          1. AUDIO INPUT
      ====================================================== */}

      <AudioInputPanel
        recordingMetadata={cleanMetadata}
        onRecordingComplete={
          handleRecordingComplete
        }
        onClearRecording={
          handleClearAll
        }
      />

      {/* ======================================================
          2. NOISE + SNR
      ====================================================== */}

      <NoiseSelectionPanel
        hasCleanAudio={
          cleanMetadata !== null
        }
        targetSnr={
          targetSnrDb
        }
        onTargetSnrChange={
          setTargetSnrDb
        }
        onNoiseLoaded={
          handleNoiseLoaded
        }
      />

      {/* ======================================================
          3. BEFORE / AFTER
      ====================================================== */}

      <BeforeAfterSignalView
        originalBuffer={
          cleanMetadata?.audioBuffer ?? null
        }

        originalUrl={
          cleanMetadata?.audioUrl ?? null
        }

        mixedBuffer={
          mixedBuffer
        }

        mixedUrl={
          mixedUrl
        }

        enhancedBuffer={
          enhancedBuffer
        }

        enhancedUrl={
          enhancedUrl
        }

        isBackendConnected={
          isBackendConnected
        }

        onSelectActiveAudioForSpectrogram={
          (buffer) => {
            if (!buffer) return;

            if (
              enhancedBuffer === buffer
            ) {
              setActiveAnalysisSource(
                'ENHANCED'
              );
            } else if (
              mixedBuffer === buffer
            ) {
              setActiveAnalysisSource(
                'MIXED'
              );
            } else if (
              cleanMetadata?.audioBuffer ===
              buffer
            ) {
              setActiveAnalysisSource(
                'CLEAN'
              );
            }
          }
        }
      />

      {/* ======================================================
          4. TIME-FREQUENCY ANALYSIS
      ====================================================== */}

      <TimeFrequencyAnalysis
        isRunning={
          activeAnalysisBuffer !== null
        }
        activeAudioBuffer={
          activeAnalysisBuffer
        }
      />

      {/* ======================================================
          AUDIO SOURCE SELECTOR
      ====================================================== */}

      <div className="bg-[#0B0E0B] border border-[#232B20] p-3">

        <div className="flex items-center justify-between mb-2">

          <div>
            <div className="text-[10px] text-[#69755F] uppercase">
              ACTIVE ANALYSIS SOURCE
            </div>

            <div className="text-[11px] text-[#D0D6CA] font-bold mt-0.5">
              {activeAnalysisSource}
            </div>
          </div>

          <div className="text-[9px] text-[#65735B]">
            SELECT SIGNAL FOR SPECTRAL ANALYSIS
          </div>

        </div>

        <div className="flex flex-wrap gap-2">

          <button
            disabled={!cleanMetadata?.audioBuffer}
            onClick={() =>
              setActiveAnalysisSource(
                'CLEAN'
              )
            }
            className={`px-3 py-1.5 border text-[10px] font-bold transition-colors ${
              activeAnalysisSource === 'CLEAN'
                ? 'bg-[#2E3727] border-[#69754B] text-[#E8ECE5]'
                : 'bg-[#121612] border-[#283024] text-[#77836C] hover:bg-[#1A2118]'
            } ${
              !cleanMetadata?.audioBuffer
                ? 'opacity-40 cursor-not-allowed'
                : 'cursor-pointer'
            }`}
          >
            CLEAN SPEECH
          </button>

          <button
            disabled={!mixedBuffer}
            onClick={() =>
              setActiveAnalysisSource(
                'MIXED'
              )
            }
            className={`px-3 py-1.5 border text-[10px] font-bold transition-colors ${
              activeAnalysisSource === 'MIXED'
                ? 'bg-[#2E3727] border-[#69754B] text-[#E8ECE5]'
                : 'bg-[#121612] border-[#283024] text-[#77836C] hover:bg-[#1A2118]'
            } ${
              !mixedBuffer
                ? 'opacity-40 cursor-not-allowed'
                : 'cursor-pointer'
            }`}
          >
            NOISY MIXTURE
          </button>

          <button
            disabled={!enhancedBuffer}
            onClick={() =>
              setActiveAnalysisSource(
                'ENHANCED'
              )
            }
            className={`px-3 py-1.5 border text-[10px] font-bold transition-colors ${
              activeAnalysisSource === 'ENHANCED'
                ? 'bg-[#2E3727] border-[#69754B] text-[#E8ECE5]'
                : 'bg-[#121612] border-[#283024] text-[#77836C] hover:bg-[#1A2118]'
            } ${
              !enhancedBuffer
                ? 'opacity-40 cursor-not-allowed'
                : 'cursor-pointer'
            }`}
          >
            NIRVAN ENHANCED
          </button>

        </div>
      </div>

      {/* ======================================================
          5. NIRVAN PROCESSING
      ====================================================== */}

      <NirvanProcessingSection
        speechBlob={
          cleanMetadata?.audioBuffer
            ? audioBufferToWavBlob(
                cleanMetadata.audioBuffer
              )
            : null
        }

        noiseBlob={
          noiseBlob
        }

        targetSnrDb={
          targetSnrDb
        }

        onProcessingSuccess={
          handleProcessingSuccess
        }

        onBackendStatusChange={
          setIsBackendConnected
        }
      />

      {/* ======================================================
          SESSION DEBUG / SHARED STATE
          Hidden from UI but keeps processingResponse referenced
          and available through AudioSessionContext.
      ====================================================== */}

      {processingResponse && (
        <div className="hidden">
          NIRVAN AI RESULT READY
        </div>
      )}

      {/* actualSnrDb is intentionally stored in shared context
          for SNR Analysis and other dashboard tabs. */}

      {actualSnrDb !== null && (
        <div className="hidden">
          ACTUAL SNR: {actualSnrDb} dB
        </div>
      )}

    </div>
  );
};