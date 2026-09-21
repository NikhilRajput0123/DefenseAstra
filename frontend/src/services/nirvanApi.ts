export interface ProcessAudioRequest {
  speechAudio: Blob | File;
  noiseAudio?: Blob | File | null;
  targetSnrDb: number;
}

export interface NoisePrediction {
  class_id: number;
  noise_type: string;
  confidence: number;
}

export interface NoiseClassification {
  class_id: number;
  noise_type: string;
  confidence: number;
  top_predictions?: NoisePrediction[];
}

export interface NoiseInfo {
  noise_type: string;
  noise_nature?: string;
  intensity_dbfs?: number | null;
  class_id?: number;
  confidence?: number;
}

export interface AudioOutput {
  audio_id?: string;
  url: string;
  duration_s?: number;
}

export interface AudioOutputs {
  noisy: AudioOutput;
  enhanced: AudioOutput;
}

/**
 * One waveform returned by the backend.
 *
 * Backend structure:
 * waveform.noisy.samples
 * waveform.enhanced.samples
 */
export interface WaveformChannel {
  samples: number[];
  sample_rate: number;
  duration_s: number;
  n_samples_original: number;
  n_samples_visualization: number;
}

/**
 * Complete waveform visualization response.
 */
export interface WaveformData {
  noisy: WaveformChannel;
  enhanced: WaveformChannel;
  sample_rate: number;
  duration_s: number;
}

/**
 * One spectrogram returned by the backend.
 *
 * Backend structure:
 * spectrogram.noisy.data
 * spectrogram.enhanced.data
 */
export interface SpectrogramChannel {
  data: number[][];
  freq_bins: number;
  time_frames: number;
  n_fft: number;
  hop_length: number;
  sample_rate: number;
}

/**
 * Complete spectrogram visualization response.
 */
export interface SpectrogramData {
  noisy: SpectrogramChannel;
  enhanced: SpectrogramChannel;
}

export interface ProcessingMetrics {
  reference_available: boolean;

  snr_before: number | null;
  snr_after: number | null;
  snr_improvement: number | null;

  si_snr_before: number | null;
  si_snr_after: number | null;
  si_snr_improvement: number | null;

  stoi_before: number | null;
  stoi_after: number | null;
  stoi_improvement: number | null;

  pesq: number | null;

  noise_reduction_pct: number | null;
  speech_preservation_pct: number | null;

  classifier_latency_ms: number | null;
  enhancement_latency_ms: number | null;
  total_latency_ms: number | null;

  rms_input: number | null;
  rms_enhanced: number | null;
}

export interface ProcessAudioResponse {
  session_id?: string;
  mode?: string;

  noise_classification: NoiseClassification;
  noise_info: NoiseInfo;

  audio: AudioOutputs;

  waveform: WaveformData;
  spectrogram: SpectrogramData;

  metrics: ProcessingMetrics;

  target_snr_db: number | null;
  actual_snr_db: number | null;

  processing_mode: string;
  model_used: string;
  classifier_used: string;
}

/**
 * Send audio to the NIRVAN AI backend.
 */
export async function processAudioWithNirvan(
  req: ProcessAudioRequest
): Promise<ProcessAudioResponse> {
  const formData = new FormData();

  formData.append(
    'speech_audio',
    req.speechAudio,
    'speech.wav'
  );

  if (req.noiseAudio) {
    formData.append(
      'noise_audio',
      req.noiseAudio,
      'noise.wav'
    );
  }

  formData.append(
    'target_snr_db',
    String(req.targetSnrDb)
  );

  /*
   * Backend currently supports:
   *   mode=demo
   *   mode=upload
   *
   * The current frontend workflow uses demo mode
   * where clean speech + real dataset noise are mixed
   * by the backend.
   */
  formData.append(
    'mode',
    'demo'
  );

  try {
    const response = await fetch(
      '/api/audio/process',
      {
        method: 'POST',
        body: formData,
      }
    );

    if (!response.ok) {
      let errorMessage = '';

      try {
        const errorData =
          await response.json();

        if (
          errorData &&
          typeof errorData.detail === 'string'
        ) {
          errorMessage =
            errorData.detail;
        } else if (
          errorData?.detail
        ) {
          errorMessage =
            JSON.stringify(
              errorData.detail
            );
        }
      } catch {
        try {
          errorMessage =
            await response.text();
        } catch {
          errorMessage = '';
        }
      }

      throw new Error(
        `BACKEND ERROR (${response.status} ${response.statusText})${
          errorMessage
            ? `: ${errorMessage}`
            : ''
        }`
      );
    }

    const data =
      (await response.json()) as ProcessAudioResponse;

    /*
     * Debug the complete backend response.
     *
     * This is intentionally kept so we can verify
     * waveform/spectrogram data during integration.
     */
    console.log(
      'NIRVAN AI backend response:',
      {
        session_id:
          data.session_id,

        noise_classification:
          data.noise_classification,

        waveform:
          data.waveform,

        spectrogram:
          data.spectrogram,

        metrics:
          data.metrics,
      }
    );

    return data;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error(
      'BACKEND NOT CONNECTED'
    );
  }
}

/**
 * Check whether NIRVAN AI backend is running.
 *
 * Frontend:
 *   /health
 *
 * Vite proxy:
 *   /health -> http://127.0.0.1:8000/health
 */
export async function checkNirvanBackend(): Promise<boolean> {
  try {
    const response =
      await fetch(
        '/health',
        {
          method: 'GET',
          headers: {
            Accept:
              'application/json',
          },
          cache: 'no-store',
        }
      );

    if (!response.ok) {
      console.error(
        'NIRVAN backend returned:',
        response.status,
        response.statusText
      );

      return false;
    }

    const data =
      await response.json();

    console.log(
      'NIRVAN backend health:',
      data
    );

    return (
      data?.status === 'ok' ||
      data?.status === 'healthy' ||
      data?.status === 'online'
    );
  } catch (error) {
    console.error(
      'NIRVAN backend connection failed:',
      error
    );

    return false;
  }
}

/**
 * Convert an AudioBuffer into a WAV Blob.
 */
export function audioBufferToWavBlob(
  audioBuffer: AudioBuffer
): Blob {
  const numberOfChannels =
    audioBuffer.numberOfChannels;

  const sampleRate =
    audioBuffer.sampleRate;

  const length =
    audioBuffer.length;

  const interleaved =
    new Float32Array(
      length *
        numberOfChannels
    );

  for (
    let channel = 0;
    channel < numberOfChannels;
    channel++
  ) {
    const channelData =
      audioBuffer.getChannelData(
        channel
      );

    for (
      let i = 0;
      i < length;
      i++
    ) {
      interleaved[
        i *
          numberOfChannels +
          channel
      ] = channelData[i];
    }
  }

  const buffer =
    new ArrayBuffer(
      44 +
        interleaved.length *
          2
    );

  const view =
    new DataView(buffer);

  writeString(
    view,
    0,
    'RIFF'
  );

  view.setUint32(
    4,
    36 +
      interleaved.length *
        2,
    true
  );

  writeString(
    view,
    8,
    'WAVE'
  );

  writeString(
    view,
    12,
    'fmt '
  );

  view.setUint32(
    16,
    16,
    true
  );

  view.setUint16(
    20,
    1,
    true
  );

  view.setUint16(
    22,
    numberOfChannels,
    true
  );

  view.setUint32(
    24,
    sampleRate,
    true
  );

  const byteRate =
    sampleRate *
    numberOfChannels *
    2;

  view.setUint32(
    28,
    byteRate,
    true
  );

  view.setUint16(
    32,
    numberOfChannels * 2,
    true
  );

  view.setUint16(
    34,
    16,
    true
  );

  writeString(
    view,
    36,
    'data'
  );

  view.setUint32(
    40,
    interleaved.length *
      2,
    true
  );

  floatTo16BitPCM(
    view,
    44,
    interleaved
  );

  return new Blob(
    [buffer],
    {
      type: 'audio/wav',
    }
  );
}

/**
 * Mix speech and noise at a target SNR.
 */
export function mixAudioBuffers(
  speechBuffer: AudioBuffer,
  noiseBuffer: AudioBuffer,
  targetSnrDb: number
): AudioBuffer {
  const sampleRate =
    speechBuffer.sampleRate;

  const speechLength =
    speechBuffer.length;

  const output =
    new Float32Array(
      speechLength
    );

  const speechData =
    speechBuffer.getChannelData(
      0
    );

  const noiseData =
    noiseBuffer.getChannelData(
      0
    );

  const noiseLength =
    noiseData.length;

  if (noiseLength === 0) {
    return createAudioBufferFromMono(
      speechData,
      sampleRate
    );
  }

  let speechPower = 0;

  for (
    let i = 0;
    i < speechLength;
    i++
  ) {
    speechPower +=
      speechData[i] *
      speechData[i];
  }

  speechPower /=
    Math.max(
      speechLength,
      1
    );

  let noisePower = 0;

  const noiseSamples =
    Math.min(
      speechLength,
      noiseLength
    );

  for (
    let i = 0;
    i < noiseSamples;
    i++
  ) {
    noisePower +=
      noiseData[i] *
      noiseData[i];
  }

  noisePower /=
    Math.max(
      noiseSamples,
      1
    );

  if (noisePower <= 0) {
    return createAudioBufferFromMono(
      speechData,
      sampleRate
    );
  }

  const targetLinear =
    Math.pow(
      10,
      targetSnrDb / 10
    );

  const desiredNoisePower =
    speechPower /
    targetLinear;

  const scale =
    Math.sqrt(
      desiredNoisePower /
        noisePower
    );

  for (
    let i = 0;
    i < speechLength;
    i++
  ) {
    const noiseSample =
      noiseData[
        i %
          noiseLength
      ];

    output[i] =
      speechData[i] +
      noiseSample *
        scale;
  }

  return createAudioBufferFromMono(
    output,
    sampleRate
  );
}

/**
 * Create a mono AudioBuffer.
 */
function createAudioBufferFromMono(
  data: Float32Array,
  sampleRate: number
): AudioBuffer {
  const context =
    new AudioContext({
      sampleRate,
    });

  const buffer =
    context.createBuffer(
      1,
      data.length,
      sampleRate
    );

  const channel =
    buffer.getChannelData(0);

  for (
    let i = 0;
    i < data.length;
    i++
  ) {
    channel[i] =
      data[i];
  }

  void context.close();

  return buffer;
}

/**
 * Write ASCII string into DataView.
 */
function writeString(
  view: DataView,
  offset: number,
  value: string
): void {
  for (
    let i = 0;
    i < value.length;
    i++
  ) {
    view.setUint8(
      offset + i,
      value.charCodeAt(i)
    );
  }
}

/**
 * Convert Float32 PCM samples
 * into 16-bit PCM WAV data.
 */
function floatTo16BitPCM(
  view: DataView,
  offset: number,
  input: Float32Array
): void {
  for (
    let i = 0;
    i < input.length;
    i++
  ) {
    const sample =
      Math.max(
        -1,
        Math.min(
          1,
          input[i]
        )
      );

    const value =
      sample < 0
        ? sample * 0x8000
        : sample * 0x7fff;

    view.setInt16(
      offset +
        i * 2,
      value,
      true
    );
  }
}