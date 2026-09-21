import React, { useEffect, useState } from 'react';
import {
  Cpu,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

import {
  processAudioWithNirvan,
  checkNirvanBackend,
  ProcessAudioResponse,
} from '../services/nirvanApi';

export type ProcessState =
  | 'READY'
  | 'UPLOADING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'ERROR';

interface NirvanProcessingSectionProps {
  speechBlob: Blob | null;
  noiseBlob: Blob | null;
  targetSnrDb: number;
  onProcessingSuccess: (
    response: ProcessAudioResponse
  ) => void;
  onBackendStatusChange?: (
    isConnected: boolean
  ) => void;
}

export const NirvanProcessingSection: React.FC<
  NirvanProcessingSectionProps
> = ({
  speechBlob,
  noiseBlob,
  targetSnrDb,
  onProcessingSuccess,
  onBackendStatusChange,
}) => {
  const [processState, setProcessState] =
    useState<ProcessState>('READY');

  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  const [activePipelineStageIndex, setActivePipelineStageIndex] =
    useState<number>(0);

  // ============================================================
  // REAL BACKEND METRICS
  // ============================================================

  const [snrBefore, setSnrBefore] =
    useState<string>('--');

  const [snrAfter, setSnrAfter] =
    useState<string>('--');

  const [processingTime, setProcessingTime] =
    useState<string>('--');

  const [duration, setDuration] =
    useState<string>('--');

  const pipelineStages = [
    'AUDIO INPUT',
    'BUFFER',
    'PRE-PROCESSING',
    'NOISE MIXING',
    'SIGNAL ANALYSIS',
    'NOISE CHARACTERIZATION',
    'AUDIO PROCESSING',
    'SIGNAL RECONSTRUCTION',
    'OUTPUT',
  ];

  // ============================================================
  // CHECK BACKEND WHEN COMPONENT LOADS
  // ============================================================

  useEffect(() => {
    let mounted = true;

    const checkBackend = async () => {
      const connected =
        await checkNirvanBackend();

      if (!mounted) {
        return;
      }

      onBackendStatusChange?.(
        connected
      );
    };

    checkBackend();

    return () => {
      mounted = false;
    };
  }, [
    onBackendStatusChange,
  ]);

  // ============================================================
  // PROCESS AUDIO
  // ============================================================

  const handleProcess = async () => {
    if (!speechBlob) {
      setErrorMessage(
        'RECORD OR UPLOAD SPEECH AUDIO FIRST'
      );

      setProcessState(
        'ERROR'
      );

      return;
    }

    setErrorMessage(null);

    setProcessState(
      'UPLOADING'
    );

    setActivePipelineStageIndex(
      0
    );

    // ----------------------------------------------------------
    // Visual pipeline progress
    // ----------------------------------------------------------

    const stageInterval =
      window.setInterval(() => {
        setActivePipelineStageIndex(
          (prev) =>
            prev < 7
              ? prev + 1
              : prev
        );
      }, 500);

    try {
      // --------------------------------------------------------
      // Actual backend processing
      // --------------------------------------------------------

      setProcessState(
        'PROCESSING'
      );

      const res =
        await processAudioWithNirvan({
          speechAudio:
            speechBlob,

          noiseAudio:
            noiseBlob,

          targetSnrDb:
            targetSnrDb,
        });

      // --------------------------------------------------------
      // Stop visual progress
      // --------------------------------------------------------

      clearInterval(
        stageInterval
      );

      setActivePipelineStageIndex(
        8
      );

      // --------------------------------------------------------
      // Backend successfully responded
      // --------------------------------------------------------

      setProcessState(
        'COMPLETED'
      );

      setErrorMessage(
        null
      );

      onBackendStatusChange?.(
        true
      );

      // ========================================================
      // REAL METRICS FROM BACKEND
      // ========================================================

      const metrics =
        res?.metrics;

      if (metrics) {
        setSnrBefore(
          typeof metrics.snr_before ===
            'number'
            ? `${metrics.snr_before.toFixed(2)} dB`
            : '--'
        );

        setSnrAfter(
          typeof metrics.snr_after ===
            'number'
            ? `${metrics.snr_after.toFixed(2)} dB`
            : '--'
        );

        setProcessingTime(
          typeof metrics.total_latency_ms ===
            'number'
            ? `${metrics.total_latency_ms.toFixed(1)} ms`
            : '--'
        );
      } else {
        setSnrBefore('--');
        setSnrAfter('--');
        setProcessingTime('--');
      }

      // ========================================================
      // AUDIO DURATION
      // ========================================================
    // ========================================================
// AUDIO DURATION
// ========================================================

try {
  const audioContext =
    new AudioContext();

  const arrayBuffer =
    await speechBlob.arrayBuffer();

  const audioBuffer =
    await audioContext.decodeAudioData(
      arrayBuffer
    );

  setDuration(
    `${audioBuffer.duration.toFixed(2)}s`
  );

  await audioContext.close();
} catch {
  setDuration('--');
}

      // ========================================================
      // SEND COMPLETE REAL RESPONSE TO WORKSPACE
      // ========================================================

      onProcessingSuccess(
        res
      );

      console.log(
        'NIRVAN AI processing completed:',
        res
      );
    } catch (err: unknown) {
      clearInterval(
        stageInterval
      );

      const msg =
        err instanceof Error
          ? err.message
          : 'BACKEND NOT CONNECTED';

      console.error(
        'NIRVAN processing failed:',
        err
      );

      setErrorMessage(
        msg
      );

      setProcessState(
        'ERROR'
      );

      onBackendStatusChange?.(
        false
      );

      // Stop around the stage where
      // the request failed.
      setActivePipelineStageIndex(
        3
      );
    }
  };

  // ============================================================
  // STATUS BADGE
  // ============================================================

  const getStatusBadge = () => {
    switch (processState) {
      case 'READY':
        return 'bg-[#121612] text-[#86927C] border-[#252E22]';

      case 'UPLOADING':
      case 'PROCESSING':
        return 'bg-[#222114] text-[#D8C775] border-[#4D4522] animate-pulse';

      case 'COMPLETED':
        return 'bg-[#152014] text-[#A4BA75] border-[#2C3E26]';

      case 'ERROR':
        return 'bg-[#261515] text-[#D87575] border-[#4A2424]';

      default:
        return 'bg-[#121612] text-[#86927C] border-[#252E22]';
    }
  };

  const isProcessing =
    processState === 'UPLOADING' ||
    processState === 'PROCESSING';

  // ============================================================
  // UI
  // ============================================================

  return (
    <div className="bg-[#0B0E0B] border border-[#232B20] p-3 font-mono text-xs flex flex-col space-y-3">

      {/* ======================================================
          TOP ACTION ROW
      ====================================================== */}

      <div className="flex flex-wrap items-center justify-between pb-2 border-b border-[#1F261C] gap-2">

        <div className="flex items-center space-x-2">

          <span className="w-2 h-2 bg-[#69754B]" />

          <span className="font-bold text-[#E2E6DF] tracking-wider uppercase">
            NIRVAN ENHANCEMENT ENGINE
          </span>

          <span className="text-[10px] text-[#717C67]">
            [POST /api/audio/process]
          </span>

        </div>

        <div className="flex items-center space-x-3">

          <span
            className={`px-2.5 py-0.5 border text-[10px] font-semibold ${getStatusBadge()}`}
          >
            {processState}
          </span>

          {/* PROCESS BUTTON */}

          <button
            id="btn-process-nirvan"
            disabled={
              isProcessing ||
              !speechBlob
            }
            onClick={
              handleProcess
            }
            className={`flex items-center space-x-2 px-4 py-2 border font-bold text-xs uppercase tracking-wider transition-colors ${
              isProcessing ||
              !speechBlob
                ? 'bg-[#182017] border-[#2E3B27] text-[#78856F] cursor-not-allowed'
                : 'bg-[#1E291B] border-[#557044] text-[#D2E69E] hover:bg-[#283824] hover:text-[#E8F5C4] cursor-pointer'
            }`}
          >

            {isProcessing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#C2D88C]" />

                <span>
                  PROCESSING WITH NIRVAN...
                </span>
              </>
            ) : (
              <>
                <Cpu className="w-3.5 h-3.5 text-[#A4BA75]" />

                <span>
                  PROCESS WITH NIRVAN
                </span>
              </>
            )}

          </button>

        </div>
      </div>

      {/* ======================================================
          ERROR NOTICE
      ====================================================== */}

      {errorMessage && (
        <div className="p-2.5 bg-[#1F1313] border border-[#482222] text-[#E08A8A] flex items-center justify-between text-[11px]">

          <div className="flex items-center space-x-2">

            <AlertTriangle className="w-4 h-4 text-[#D87575] shrink-0" />

            <span className="font-bold">
              NOTICE: {errorMessage}
            </span>

          </div>

          <span className="text-[10px] text-[#A66E6E]">
            CHECK PYTHON BACKEND ON PORT 8000
          </span>

        </div>
      )}

      {/* ======================================================
          SUCCESS NOTICE
      ====================================================== */}

      {processState === 'COMPLETED' && (
        <div className="p-2.5 bg-[#101810] border border-[#2C3E26] text-[#A4BA75] flex items-center space-x-2 text-[11px]">

          <CheckCircle2 className="w-4 h-4 shrink-0" />

          <span className="font-bold">
            NIRVAN AI PROCESSING COMPLETED — REAL MODEL OUTPUT RECEIVED
          </span>

        </div>
      )}

      {/* ======================================================
          PIPELINE
      ====================================================== */}

      <div className="p-2.5 bg-[#0E120E] border border-[#1E251B]">

        <div className="flex items-center justify-between mb-2">

          <span className="font-bold text-[#CBD2C4] text-[10px] uppercase tracking-wider">
            PROCESSING PIPELINE EXECUTION STAGES
          </span>

          <span className="text-[9px] text-[#69755F]">
            9-STAGE AI PIPELINE
          </span>

        </div>

        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-1">

          {pipelineStages.map(
            (
              stage,
              idx
            ) => {

              const isCurrent =
                isProcessing &&
                activePipelineStageIndex ===
                  idx;

              const isCompleted =
                processState ===
                  'COMPLETED' ||
                activePipelineStageIndex >
                  idx;

              const isFailed =
                processState ===
                  'ERROR' &&
                activePipelineStageIndex ===
                  idx;

              return (
                <div
                  key={
                    stage
                  }
                  className={`p-1.5 border text-center flex flex-col justify-between ${
                    isCurrent
                      ? 'bg-[#232312] border-[#706424] text-[#E5D78A]'
                      : isFailed
                      ? 'bg-[#241414] border-[#5A2828] text-[#E08A8A]'
                      : isCompleted
                      ? 'bg-[#152014] border-[#2C3E26] text-[#A4BA75]'
                      : 'bg-[#0A0D0A] border-[#1C241A] text-[#55634D]'
                  }`}
                >

                  <div className="text-[8px] text-[#556149]">
                    0{idx + 1}
                  </div>

                  <div className="text-[9px] font-bold mt-0.5 leading-tight">
                    {stage}
                  </div>

                </div>
              );
            }
          )}

        </div>
      </div>

      {/* ======================================================
          RESULTS
      ====================================================== */}

      <div className="p-2.5 bg-[#0E120E] border border-[#1E251B]">

        <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-[#182016]">

          <span className="font-bold text-[#CBD2C4] text-[10px] uppercase tracking-wider">
            RESULTS &amp; PERFORMANCE METRICS
          </span>

          <span className="text-[9px] text-[#65735B]">
            ACCURACY DIRECTIVE: NO FABRICATED METRICS
          </span>

        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">

          {/* SNR BEFORE */}

          <div className="bg-[#080C08] p-2 border border-[#182016]">

            <div className="text-[#65735B] text-[9px] uppercase">
              SNR BEFORE
            </div>

            <div className="font-bold text-[#D0D6CA] mt-0.5">
              {snrBefore}
            </div>

          </div>

          {/* SNR AFTER */}

          <div className="bg-[#080C08] p-2 border border-[#182016]">

            <div className="text-[#65735B] text-[9px] uppercase">
              SNR AFTER
            </div>

            <div className="font-bold text-[#D0D6CA] mt-0.5">
              {snrAfter}
            </div>

          </div>

          {/* PROCESSING TIME */}

          <div className="bg-[#080C08] p-2 border border-[#182016]">

            <div className="text-[#65735B] text-[9px] uppercase">
              PROCESSING TIME
            </div>

            <div className="font-bold text-[#D0D6CA] mt-0.5">
              {processingTime}
            </div>

          </div>

          {/* DURATION */}

          <div className="bg-[#080C08] p-2 border border-[#182016]">

            <div className="text-[#65735B] text-[9px] uppercase">
              DURATION
            </div>

            <div className="font-bold text-[#D0D6CA] mt-0.5">
              {duration}
            </div>

          </div>

        </div>
      </div>

    </div>
  );
};