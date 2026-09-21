// Real Audio Recording & Web Audio Management Service for NIRVAN

export interface RecordingMetadata {
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  blob: Blob | null;
  audioBuffer: AudioBuffer | null;
  audioUrl: string | null;
}

export class AudioRecorderService {
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;

  private startTime = 0;
  private timerInterval: number | null = null;
  private elapsedSeconds = 0;

  private status: 'READY' | 'RECORDING' | 'PAUSED' | 'RECORDED' = 'READY';

  private onTickCallback: ((seconds: number) => void) | null = null;
  private onStatusChangeCallback: ((status: 'READY' | 'RECORDING' | 'PAUSED' | 'RECORDED') => void) | null = null;

  public async startRecording(
    onTick: (seconds: number) => void,
    onStatusChange: (status: 'READY' | 'RECORDING' | 'PAUSED' | 'RECORDED') => void
  ): Promise<void> {
    this.onTickCallback = onTick;
    this.onStatusChangeCallback = onStatusChange;
    this.audioChunks = [];

    // Request actual microphone stream
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioContext = new AudioCtx();
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 2048;
    this.analyserNode.smoothingTimeConstant = 0.8;

    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.sourceNode.connect(this.analyserNode);

    // Prefer standard formats
    const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
    let selectedMime = '';
    for (const mime of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mime)) {
        selectedMime = mime;
        break;
      }
    }

    this.mediaRecorder = new MediaRecorder(this.mediaStream, selectedMime ? { mimeType: selectedMime } : undefined);

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    this.mediaRecorder.start(100); // 100ms slices
    this.startTime = Date.now();
    this.elapsedSeconds = 0;
    this.status = 'RECORDING';
    this.onStatusChangeCallback?.('RECORDING');

    this.timerInterval = window.setInterval(() => {
      this.elapsedSeconds += 1;
      this.onTickCallback?.(this.elapsedSeconds);
    }, 1000);
  }

  public pauseRecording(): void {
    if (this.mediaRecorder && this.status === 'RECORDING') {
      this.mediaRecorder.pause();
      if (this.timerInterval) clearInterval(this.timerInterval);
      this.status = 'PAUSED';
      this.onStatusChangeCallback?.('PAUSED');
    }
  }

  public resumeRecording(): void {
    if (this.mediaRecorder && this.status === 'PAUSED') {
      this.mediaRecorder.resume();
      this.status = 'RECORDING';
      this.onStatusChangeCallback?.('RECORDING');
      this.timerInterval = window.setInterval(() => {
        this.elapsedSeconds += 1;
        this.onTickCallback?.(this.elapsedSeconds);
      }, 1000);
    }
  }

  public async stopRecording(): Promise<RecordingMetadata> {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    return new Promise((resolve) => {
      if (!this.mediaRecorder) {
        this.status = 'READY';
        this.onStatusChangeCallback?.('READY');
        resolve({
          durationSeconds: 0,
          sampleRate: 0,
          channels: 0,
          blob: null,
          audioBuffer: null,
          audioUrl: null,
        });
        return;
      }

      this.mediaRecorder.onstop = async () => {
        const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
        const blob = new Blob(this.audioChunks, { type: mimeType });
        const audioUrl = URL.createObjectURL(blob);

        let audioBuffer: AudioBuffer | null = null;
        let sampleRate = 44100;
        let channels = 1;

        if (this.audioContext) {
          try {
            const arrayBuf = await blob.arrayBuffer();
            audioBuffer = await this.audioContext.decodeAudioData(arrayBuf);
            sampleRate = audioBuffer.sampleRate;
            channels = audioBuffer.numberOfChannels;
          } catch (e) {
            console.warn('Direct decodeAudioData fallback:', e);
            if (this.audioContext) {
              sampleRate = this.audioContext.sampleRate;
            }
          }
        }

        // Clean up stream tracks
        if (this.mediaStream) {
          this.mediaStream.getTracks().forEach((t) => t.stop());
          this.mediaStream = null;
        }

        this.status = 'RECORDED';
        this.onStatusChangeCallback?.('RECORDED');

        resolve({
          durationSeconds: this.elapsedSeconds,
          sampleRate,
          channels,
          blob,
          audioBuffer,
          audioUrl,
        });
      };

      this.mediaRecorder.stop();
    });
  }

  public clear(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch {
        /* ignore */
      }
      this.audioContext = null;
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.status = 'READY';
    this.elapsedSeconds = 0;
    this.onStatusChangeCallback?.('READY');
  }

  public getLiveTimeDomainData(): Float32Array | null {
    if (!this.analyserNode || this.status !== 'RECORDING') return null;
    const buffer = new Float32Array(this.analyserNode.fftSize);
    this.analyserNode.getFloatTimeDomainData(buffer);
    return buffer;
  }

  public getLiveFrequencyData(): Uint8Array | null {
    if (!this.analyserNode || this.status !== 'RECORDING') return null;
    const buffer = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.analyserNode.getByteFrequencyData(buffer);
    return buffer;
  }

  public getStatus(): 'READY' | 'RECORDING' | 'PAUSED' | 'RECORDED' {
    return this.status;
  }
}

export const audioRecorderService = new AudioRecorderService();
