import React from 'react';
import {
  Volume2,
  ShieldAlert,
  Cpu,
  Activity,
  Radio,
  BrainCircuit,
} from 'lucide-react';

import { useAudioSession } from '../context/AudioSessionContext';

interface NoiseProfile {
  id: number;
  name: string;
  category: string;
  stationarity: string;
  harmonics: string;
  entropy: string;
  status: string;
  recommendation: string;
}

/*
 * IMPORTANT:
 * This mapping follows the actual classifier class IDs
 * used by the NIRVAN AI model.
 */
const noiseProfiles: NoiseProfile[] = [
  {
    id: 0,
    name: 'HELICOPTER',
    category: 'ROTOR',
    stationarity: 'LOW',
    harmonics: 'HIGH',
    entropy: 'MEDIUM',
    status: 'SUPPORTED',
    recommendation: 'Spectral harmonic suppression',
  },
  {
    id: 1,
    name: 'GUNSHOT',
    category: 'IMPULSIVE',
    stationarity: 'VERY LOW',
    harmonics: 'LOW',
    entropy: 'HIGH',
    status: 'SUPPORTED',
    recommendation: 'Transient-aware spectral suppression',
  },
  {
    id: 2,
    name: 'EXPLOSION',
    category: 'IMPULSIVE',
    stationarity: 'VERY LOW',
    harmonics: 'LOW',
    entropy: 'VERY HIGH',
    status: 'SUPPORTED',
    recommendation: 'Transient-aware suppression',
  },
  {
    id: 3,
    name: 'ARTILLERY',
    category: 'IMPULSIVE',
    stationarity: 'VERY LOW',
    harmonics: 'LOW',
    entropy: 'VERY HIGH',
    status: 'SUPPORTED',
    recommendation: 'High-energy transient suppression',
  },
  {
    id: 4,
    name: 'DRONE',
    category: 'ROTOR',
    stationarity: 'MEDIUM',
    harmonics: 'HIGH',
    entropy: 'MEDIUM',
    status: 'SUPPORTED',
    recommendation: 'Harmonic spectral suppression',
  },
  {
    id: 5,
    name: 'MILITARY VEHICLE',
    category: 'MECHANICAL',
    stationarity: 'MEDIUM',
    harmonics: 'HIGH',
    entropy: 'LOW',
    status: 'SUPPORTED',
    recommendation: 'Adaptive mechanical-noise suppression',
  },
  {
    id: 6,
    name: 'HEAVY ENGINE',
    category: 'MECHANICAL',
    stationarity: 'MEDIUM',
    harmonics: 'HIGH',
    entropy: 'LOW',
    status: 'SUPPORTED',
    recommendation: 'Low-frequency harmonic suppression',
  },
  {
    id: 7,
    name: 'WIND',
    category: 'AMBIENT',
    stationarity: 'LOW',
    harmonics: 'LOW',
    entropy: 'HIGH',
    status: 'SUPPORTED',
    recommendation: 'Broadband atmospheric-noise suppression',
  },
  {
    id: 8,
    name: 'TRAFFIC',
    category: 'AMBIENT',
    stationarity: 'MEDIUM',
    harmonics: 'LOW',
    entropy: 'HIGH',
    status: 'SUPPORTED',
    recommendation: 'Broadband adaptive suppression',
  },
  {
    id: 9,
    name: 'MACHINERY',
    category: 'MECHANICAL',
    stationarity: 'MEDIUM',
    harmonics: 'HIGH',
    entropy: 'MEDIUM',
    status: 'SUPPORTED',
    recommendation: 'Adaptive spectral suppression',
  },
  {
    id: 10,
    name: 'SIREN',
    category: 'TONAL',
    stationarity: 'LOW',
    harmonics: 'HIGH',
    entropy: 'MEDIUM',
    status: 'SUPPORTED',
    recommendation: 'Harmonic and tonal suppression',
  },
  {
    id: 11,
    name: 'CROWD',
    category: 'AMBIENT',
    stationarity: 'LOW',
    harmonics: 'LOW',
    entropy: 'HIGH',
    status: 'SUPPORTED',
    recommendation: 'Broadband speech-noise suppression',
  },
];

const formatPercent = (
  value: number | null | undefined
): string => {
  if (
    value === null ||
    value === undefined ||
    Number.isNaN(value)
  ) {
    return '--';
  }

  /*
   * Backend confidence is already represented
   * as a value between 0 and 1.
   */
  return `${(value * 100).toFixed(1)}%`;
};

const formatLatency = (
  value: number | null | undefined
): string => {
  if (
    value === null ||
    value === undefined ||
    Number.isNaN(value)
  ) {
    return '--';
  }

  return `${value.toFixed(1)} ms`;
};

const NoiseIntelligencePanel: React.FC = () => {
  const {
    noiseName,
    noiseBuffer,
    processingResponse,
  } = useAudioSession();

  /*
   * ============================================================
   * REAL BACKEND CLASSIFIER RESULT
   * ============================================================
   */

  const classification =
    processingResponse?.noise_classification;

  const classId =
    classification?.class_id ?? null;

  /*
   * IMPORTANT:
   *
   * Backend schema uses:
   *   noise_type
   *
   * It does NOT use:
   *   class_name
   */
  const classifierClassName =
    classification?.noise_type ?? null;

  const confidence =
    classification?.confidence ?? null;

  const classifierName =
    processingResponse?.classifier_used ?? null;

  const classifierLatency =
    processingResponse?.metrics
      ?.classifier_latency_ms ?? null;

  /*
   * ============================================================
   * CLASS ID MAPPING
   * ============================================================
   */

  const matchingProfile =
    classId !== null
      ? noiseProfiles.find(
          (profile) =>
            profile.id === classId
        )
      : undefined;

  /*
   * Prefer the trained class-ID mapping.
   *
   * Fallback:
   *   backend noise_type
   *   selected noise name
   */

  const detectedNoise =
    matchingProfile?.name ??
    classifierClassName ??
    noiseName ??
    null;

  return (
    <div className="space-y-3">

      {/* ======================================================
          HEADER
      ======================================================= */}

      <div className="border border-[#263026] bg-[#0B100B] px-4 py-3">

        <div className="flex items-center justify-between gap-4">

          <div className="flex items-center gap-3">

            <div className="flex h-9 w-9 items-center justify-center border border-[#344234] bg-[#111711]">

              <BrainCircuit
                size={18}
                className="text-[#8FAE8F]"
              />

            </div>

            <div>

              <div className="text-[11px] font-bold tracking-[0.22em] text-[#B8C5B8]">
                NIRVAN AI
              </div>

              <div className="text-[9px] tracking-[0.18em] text-[#667166]">
                NOISE INTELLIGENCE / ACOUSTIC ANALYSIS
              </div>

            </div>

          </div>

          <div className="flex items-center gap-2">

            <span
              className={`h-2 w-2 rounded-full ${
                processingResponse
                  ? 'bg-[#6EAD6E]'
                  : 'bg-[#555D55]'
              }`}
            />

            <span className="text-[9px] tracking-[0.15em] text-[#6F786F]">
              {processingResponse
                ? 'AI RESULT AVAILABLE'
                : 'WAITING FOR ANALYSIS'}
            </span>

          </div>

        </div>

      </div>

      {/* ======================================================
          LIVE CLASSIFICATION
      ======================================================= */}

      <div className="border border-[#3A2C2C] bg-[#100D0D]">

        <div className="flex items-center justify-between border-b border-[#302424] px-4 py-3">

          <div className="flex items-center gap-2">

            <ShieldAlert
              size={15}
              className="text-[#C98282]"
            />

            <span className="text-[10px] font-bold tracking-[0.2em] text-[#C8BABA]">
              LIVE NOISE CLASSIFICATION
            </span>

          </div>

          <span className="text-[8px] tracking-[0.15em] text-[#6F6666]">
            NEURAL INFERENCE
          </span>

        </div>

        <div className="grid grid-cols-1 gap-px bg-[#2A2020] md:grid-cols-4">

          {/* DETECTED NOISE */}

          <div className="bg-[#100D0D] px-4 py-4">

            <div className="mb-2 flex items-center gap-2">

              <Volume2
                size={13}
                className="text-[#9E7A7A]"
              />

              <span className="text-[8px] tracking-[0.16em] text-[#756868]">
                DETECTED NOISE
              </span>

            </div>

            <div className="text-[15px] font-bold tracking-[0.12em] text-[#D3C2C2]">
              {detectedNoise ?? '--'}
            </div>

            {classId !== null && (
              <div className="mt-1 text-[8px] tracking-[0.12em] text-[#756868]">
                CLASS ID: {classId}
              </div>
            )}

          </div>

          {/* CONFIDENCE */}

          <div className="bg-[#100D0D] px-4 py-4">

            <div className="mb-2 flex items-center gap-2">

              <Activity
                size={13}
                className="text-[#9E7A7A]"
              />

              <span className="text-[8px] tracking-[0.16em] text-[#756868]">
                CONFIDENCE
              </span>

            </div>

            <div className="text-[15px] font-bold tracking-[0.08em] text-[#D3C2C2]">
              {formatPercent(confidence)}
            </div>

            <div className="mt-2 h-1 w-full bg-[#282020]">

              <div
                className="h-1 bg-[#A96B6B]"
                style={{
                  width:
                    confidence !== null &&
                    confidence !== undefined
                      ? `${Math.min(
                          Math.max(
                            confidence * 100,
                            0
                          ),
                          100
                        )}%`
                      : '0%',
                }}
              />

            </div>

          </div>

          {/* CLASSIFIER */}

          <div className="bg-[#100D0D] px-4 py-4">

            <div className="mb-2 flex items-center gap-2">

              <Cpu
                size={13}
                className="text-[#9E7A7A]"
              />

              <span className="text-[8px] tracking-[0.16em] text-[#756868]">
                CLASSIFIER
              </span>

            </div>

            <div className="break-all text-[11px] font-semibold tracking-[0.06em] text-[#C8BABA]">
              {classifierName ??
                'NoiseSpectrogramClassifier'}
            </div>

          </div>

          {/* LATENCY */}

          <div className="bg-[#100D0D] px-4 py-4">

            <div className="mb-2 flex items-center gap-2">

              <Radio
                size={13}
                className="text-[#9E7A7A]"
              />

              <span className="text-[8px] tracking-[0.16em] text-[#756868]">
                INFERENCE LATENCY
              </span>

            </div>

            <div className="text-[15px] font-bold tracking-[0.08em] text-[#D3C2C2]">
              {formatLatency(
                classifierLatency
              )}
            </div>

          </div>

        </div>

      </div>

      {/* ======================================================
          CURRENT ACOUSTIC PROFILE
      ======================================================= */}

      <div className="border border-[#263026] bg-[#0B100B]">

        <div className="flex items-center justify-between border-b border-[#263026] px-4 py-3">

          <div className="flex items-center gap-2">

            <Volume2
              size={14}
              className="text-[#8FAE8F]"
            />

            <span className="text-[10px] font-bold tracking-[0.18em] text-[#B8C5B8]">
              CURRENT ACOUSTIC PROFILE
            </span>

          </div>

          <span className="text-[8px] tracking-[0.15em] text-[#687268]">
            CLASSIFIER MAPPING
          </span>

        </div>

        <div className="p-4">

          {matchingProfile ? (

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">

              {/* AI RESULT */}

              <div className="border border-[#303930] bg-[#0E130E] p-4">

                <div className="mb-2 text-[8px] tracking-[0.16em] text-[#687268]">
                  AI CLASSIFICATION
                </div>

                <div className="text-[18px] font-bold tracking-[0.12em] text-[#BFCBBF]">
                  {matchingProfile.name}
                </div>

                <div className="mt-1 text-[9px] tracking-[0.14em] text-[#687268]">
                  CLASS ID {matchingProfile.id}
                </div>

                <div className="mt-3 text-[9px] leading-relaxed text-[#737D73]">
                  Classified by the trained
                  NoiseSpectrogramClassifier.
                </div>

              </div>

              {/* PROFILE */}

              <div className="border border-[#303930] bg-[#0E130E] p-4">

                <div className="mb-2 text-[8px] tracking-[0.16em] text-[#687268]">
                  ACOUSTIC PROFILE
                </div>

                <div className="text-[15px] font-bold tracking-[0.1em] text-[#BFCBBF]">
                  {matchingProfile.category}
                </div>

                <div className="mt-3 grid grid-cols-3 gap-3">

                  <div>
                    <div className="text-[7px] tracking-[0.12em] text-[#5F685F]">
                      STATIONARITY
                    </div>

                    <div className="mt-1 text-[9px] text-[#8D998D]">
                      {matchingProfile.stationarity}
                    </div>
                  </div>

                  <div>
                    <div className="text-[7px] tracking-[0.12em] text-[#5F685F]">
                      HARMONICS
                    </div>

                    <div className="mt-1 text-[9px] text-[#8D998D]">
                      {matchingProfile.harmonics}
                    </div>
                  </div>

                  <div>
                    <div className="text-[7px] tracking-[0.12em] text-[#5F685F]">
                      ENTROPY
                    </div>

                    <div className="mt-1 text-[9px] text-[#8D998D]">
                      {matchingProfile.entropy}
                    </div>
                  </div>

                </div>

                <div className="mt-3 text-[9px] leading-relaxed text-[#737D73]">
                  {matchingProfile.recommendation}
                </div>

              </div>

            </div>

          ) : (

            <div className="py-6 text-center">

              <div className="text-[10px] tracking-[0.18em] text-[#626A62]">
                NO CLASSIFICATION AVAILABLE
              </div>

              <div className="mt-2 text-[8px] tracking-[0.12em] text-[#4F574F]">
                PROCESS AN AUDIO SAMPLE TO RUN THE AI CLASSIFIER
              </div>

            </div>

          )}

        </div>

      </div>

      {/* ======================================================
          SUPPORTED NOISE PROFILES
      ======================================================= */}

      <div className="border border-[#263026] bg-[#0B100B]">

        <div className="flex items-center justify-between border-b border-[#263026] px-4 py-3">

          <div className="flex items-center gap-2">

            <ShieldAlert
              size={14}
              className="text-[#8FAE8F]"
            />

            <span className="text-[10px] font-bold tracking-[0.18em] text-[#B8C5B8]">
              SUPPORTED NOISE PROFILES
            </span>

          </div>

          <span className="text-[8px] tracking-[0.14em] text-[#687268]">
            TRAINED CLASS MAPPING
          </span>

        </div>

        <div className="overflow-x-auto">

          <table className="w-full min-w-[850px] border-collapse">

            <thead>

              <tr className="border-b border-[#263026] bg-[#0D120D]">

                <th className="px-3 py-3 text-left text-[8px] tracking-[0.15em] text-[#687268]">
                  ID
                </th>

                <th className="px-3 py-3 text-left text-[8px] tracking-[0.15em] text-[#687268]">
                  NOISE PROFILE
                </th>

                <th className="px-3 py-3 text-left text-[8px] tracking-[0.15em] text-[#687268]">
                  CATEGORY
                </th>

                <th className="px-3 py-3 text-left text-[8px] tracking-[0.15em] text-[#687268]">
                  STATIONARITY
                </th>

                <th className="px-3 py-3 text-left text-[8px] tracking-[0.15em] text-[#687268]">
                  HARMONICS
                </th>

                <th className="px-3 py-3 text-left text-[8px] tracking-[0.15em] text-[#687268]">
                  ENTROPY
                </th>

                <th className="px-3 py-3 text-left text-[8px] tracking-[0.15em] text-[#687268]">
                  STATUS
                </th>

              </tr>

            </thead>

            <tbody>

              {noiseProfiles.map(
                (profile) => {

                  const isCurrent =
                    classId === profile.id;

                  return (
                    <tr
                      key={profile.id}
                      className={`border-b border-[#202720] ${
                        isCurrent
                          ? 'bg-[#171D17]'
                          : 'bg-[#0B100B]'
                      }`}
                    >

                      <td className="px-3 py-3">

                        <span
                          className={`text-[9px] font-bold ${
                            isCurrent
                              ? 'text-[#9EB69E]'
                              : 'text-[#737D73]'
                          }`}
                        >
                          {profile.id}
                        </span>

                      </td>

                      <td className="px-3 py-3">

                        <div className="flex items-center gap-2">

                          {isCurrent && (
                            <span className="h-1.5 w-1.5 rounded-full bg-[#8EAA8E]" />
                          )}

                          <span className="text-[9px] font-semibold tracking-[0.08em] text-[#AEB9AE]">
                            {profile.name}
                          </span>

                        </div>

                      </td>

                      <td className="px-3 py-3 text-[8px] tracking-[0.1em] text-[#737D73]">
                        {profile.category}
                      </td>

                      <td className="px-3 py-3 text-[8px] tracking-[0.1em] text-[#737D73]">
                        {profile.stationarity}
                      </td>

                      <td className="px-3 py-3 text-[8px] tracking-[0.1em] text-[#737D73]">
                        {profile.harmonics}
                      </td>

                      <td className="px-3 py-3 text-[8px] tracking-[0.1em] text-[#737D73]">
                        {profile.entropy}
                      </td>

                      <td className="px-3 py-3">

                        <span
                          className={`text-[8px] font-bold tracking-[0.12em] ${
                            isCurrent
                              ? 'text-[#9EB69E]'
                              : 'text-[#667066]'
                          }`}
                        >
                          {isCurrent
                            ? 'ACTIVE'
                            : profile.status}
                        </span>

                      </td>

                    </tr>
                  );
                }
              )}

            </tbody>

          </table>

        </div>

      </div>

      {/* ======================================================
          AI PROCESSING OVERVIEW
      ======================================================= */}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">

        <div className="border border-[#263026] bg-[#0B100B] p-4">

          <div className="mb-3 flex items-center gap-2">

            <Activity
              size={14}
              className="text-[#8FAE8F]"
            />

            <span className="text-[9px] font-bold tracking-[0.16em] text-[#AAB6AA]">
              SPECTRAL ANALYSIS
            </span>

          </div>

          <div className="text-[9px] leading-relaxed text-[#687268]">
            STFT-based time-frequency representation is used
            by the AI pipeline to analyse the acoustic content
            before enhancement.
          </div>

        </div>

        <div className="border border-[#263026] bg-[#0B100B] p-4">

          <div className="mb-3 flex items-center gap-2">

            <BrainCircuit
              size={14}
              className="text-[#8FAE8F]"
            />

            <span className="text-[9px] font-bold tracking-[0.16em] text-[#AAB6AA]">
              AI CLASSIFICATION
            </span>

          </div>

          <div className="text-[9px] leading-relaxed text-[#687268]">
            NoiseSpectrogramClassifier predicts the acoustic
            noise class from the processed audio spectrogram.
          </div>

        </div>

        <div className="border border-[#263026] bg-[#0B100B] p-4">

          <div className="mb-3 flex items-center gap-2">

            <Cpu
              size={14}
              className="text-[#8FAE8F]"
            />

            <span className="text-[9px] font-bold tracking-[0.16em] text-[#AAB6AA]">
              AI ENHANCEMENT
            </span>

          </div>

          <div className="text-[9px] leading-relaxed text-[#687268]">
            LightweightSpectralUNet predicts a spectral
            suppression mask and reconstructs enhanced audio
            using the STFT/iSTFT pipeline.
          </div>

        </div>

      </div>

    </div>
  );
};

export default NoiseIntelligencePanel;