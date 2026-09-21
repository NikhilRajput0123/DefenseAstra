// Real Web Audio API Signal Processing & Analysis Engine
// Compliant with Audio Signal Processing & Dataset Intelligence Workstation requirements

export type AudioMode = 'INPUT' | 'MIXED' | 'PROCESSED';
export type TestSignalType = 'CLEAN_SPEECH' | 'CALIBRATION_1KHZ' | 'PINK_NOISE' | 'MIC_LIVE' | 'FILE_INPUT';

export interface DspMetrics {
  isActive: boolean;
  signalLevelDb: number | null; // e.g. -18.4 dBFS or null (shows '--')
  rmsDb: number | null;
  snrDb: number | null; // e.g. 12.0 dB or null (shows '--')
  frameCount: number;
  bufferSize: number;
  sampleRate: number;
  processingStatus: string;
}

class AudioDspEngine {
  private ctx: AudioContext | null = null;
  private isRunning = false;
  private audioMode: AudioMode = 'INPUT';
  private currentSignalType: TestSignalType = 'CLEAN_SPEECH';

  // Analysis Nodes
  private inputAnalyser: AnalyserNode | null = null;
  private mixedAnalyser: AnalyserNode | null = null;
  private processedAnalyser: AnalyserNode | null = null;

  // Signal Routing Nodes
  private cleanSourceNode: AudioNode | null = null;
  private noiseSourceNode: AudioNode | null = null;
  private cleanGain: GainNode | null = null;
  private noiseGain: GainNode | null = null;
  private mixerGain: GainNode | null = null;
  
  // DSP Processing Filter Chain (audio_utils.py simulation)
  private preHighpass: BiquadFilterNode | null = null;
  private lowpassFilter: BiquadFilterNode | null = null;
  private notchFilter: BiquadFilterNode | null = null;
  private outputGain: GainNode | null = null;
  private masterVolume: GainNode | null = null;

  // External audio source
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private fileBufferSource: AudioBufferSourceNode | null = null;
  private customAudioBuffer: AudioBuffer | null = null;

  // Generators for synthetic test sources
  private oscNode1: OscillatorNode | null = null;
  private oscNode2: OscillatorNode | null = null;
  private noiseBufferNode: AudioBufferSourceNode | null = null;
  private modulationInterval: number | null = null;

  // Target SNR mixing parameter (in dB)
  private targetSnrDb = 12.0;

  // Frame counter
  private frameCounter = 0;

  public init() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AudioCtx();

    // 1. Input Analyser
    this.inputAnalyser = this.ctx.createAnalyser();
    this.inputAnalyser.fftSize = 2048;
    this.inputAnalyser.smoothingTimeConstant = 0.8;

    // 2. Mixed Analyser
    this.mixedAnalyser = this.ctx.createAnalyser();
    this.mixedAnalyser.fftSize = 2048;
    this.mixedAnalyser.smoothingTimeConstant = 0.8;

    // 3. Processed Analyser
    this.processedAnalyser = this.ctx.createAnalyser();
    this.processedAnalyser.fftSize = 2048;
    this.processedAnalyser.smoothingTimeConstant = 0.8;

    // Gain stages for SNR mixing
    this.cleanGain = this.ctx.createGain();
    this.cleanGain.gain.value = 1.0;

    this.noiseGain = this.ctx.createGain();
    this.calculateGainForSnr(this.targetSnrDb);

    this.mixerGain = this.ctx.createGain();
    this.mixerGain.gain.value = 0.8;

    // DSP Filter Chain (Pre-processing -> Filter -> Reconstruction)
    this.preHighpass = this.ctx.createBiquadFilter();
    this.preHighpass.type = 'highpass';
    this.preHighpass.frequency.value = 80; // Cut DC offset & sub-rumble
    this.preHighpass.Q.value = 0.707;

    this.lowpassFilter = this.ctx.createBiquadFilter();
    this.lowpassFilter.type = 'lowpass';
    this.lowpassFilter.frequency.value = 3800; // Band-limited standard speech band
    this.lowpassFilter.Q.value = 0.707;

    this.notchFilter = this.ctx.createBiquadFilter();
    this.notchFilter.type = 'notch';
    this.notchFilter.frequency.value = 1000;
    this.notchFilter.Q.value = 8.0;

    this.outputGain = this.ctx.createGain();
    this.outputGain.gain.value = 1.0;

    this.masterVolume = this.ctx.createGain();
    this.masterVolume.gain.value = 0.2; // Safe, audible monitor volume

    // Connect DSP chain:
    // cleanGain -> inputAnalyser
    this.cleanGain.connect(this.inputAnalyser);

    // cleanGain + noiseGain -> mixerGain -> mixedAnalyser
    this.cleanGain.connect(this.mixerGain);
    this.noiseGain.connect(this.mixerGain);
    this.mixerGain.connect(this.mixedAnalyser);

    // DSP processing: mixedGain -> preHighpass -> lowpassFilter -> notchFilter -> outputGain -> processedAnalyser
    this.mixerGain.connect(this.preHighpass);
    this.preHighpass.connect(this.lowpassFilter);
    this.lowpassFilter.connect(this.notchFilter);
    this.notchFilter.connect(this.outputGain);
    this.outputGain.connect(this.processedAnalyser);

    // Output to speakers via master volume
    this.outputGain.connect(this.masterVolume);
    this.masterVolume.connect(this.ctx.destination);
  }

  private calculateGainForSnr(snrDb: number) {
    if (!this.noiseGain) return;
    // SNR = 20 * log10(A_signal / A_noise) => A_noise = A_signal * 10^(-SNR / 20)
    const noiseAmp = Math.pow(10, -snrDb / 20);
    this.noiseGain.gain.value = Math.max(0.0001, Math.min(1.5, noiseAmp));
  }

  public setSnr(snrDb: number) {
    this.targetSnrDb = snrDb;
    this.calculateGainForSnr(snrDb);
  }

  public getSnrTarget(): number {
    return this.targetSnrDb;
  }

  public setAudioMode(mode: AudioMode) {
    this.audioMode = mode;
  }

  public getAudioMode(): AudioMode {
    return this.audioMode;
  }

  public setMasterGain(gain: number) {
    if (this.masterVolume && this.ctx) {
      this.masterVolume.gain.setTargetAtTime(Math.max(0, Math.min(1, gain)), this.ctx.currentTime, 0.05);
    }
  }

  public setFilterParams(lowpassFreq: number, notchFreq: number, notchActive: boolean) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.lowpassFilter) {
      this.lowpassFilter.frequency.setTargetAtTime(lowpassFreq, t, 0.05);
    }
    if (this.notchFilter) {
      this.notchFilter.frequency.setTargetAtTime(notchFreq, t, 0.05);
      this.notchFilter.Q.setTargetAtTime(notchActive ? 8.0 : 0.001, t, 0.05);
    }
  }

  public async startAudio(type: TestSignalType = 'CLEAN_SPEECH') {
    this.init();
    if (!this.ctx) return;

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    this.stopAudioSources();
    this.currentSignalType = type;
    this.isRunning = true;

    // Start background noise generator for SNR mixing (Environmental noise / ESC-50 model)
    this.startNoiseSource();

    if (type === 'MIC_LIVE') {
      try {
        this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.micSource = this.ctx.createMediaStreamSource(this.micStream);
        if (this.cleanGain) {
          this.micSource.connect(this.cleanGain);
        }
      } catch (err) {
        console.warn('Microphone stream access unavailable, using clean synthetic signal', err);
        this.startCleanSpeechSynthesis();
      }
    } else if (type === 'FILE_INPUT' && this.customAudioBuffer) {
      this.playCustomBuffer();
    } else if (type === 'CALIBRATION_1KHZ') {
      this.startCalibrationTone();
    } else {
      this.startCleanSpeechSynthesis();
    }
  }

  public stopAudio() {
    this.stopAudioSources();
    this.isRunning = false;
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }

  public getCurrentSignalType(): TestSignalType {
    return this.currentSignalType;
  }

  private stopAudioSources() {
    if (this.modulationInterval) {
      window.clearInterval(this.modulationInterval);
      this.modulationInterval = null;
    }
    if (this.oscNode1) {
      try { this.oscNode1.stop(); } catch { /* ignore */ }
      this.oscNode1.disconnect();
      this.oscNode1 = null;
    }
    if (this.oscNode2) {
      try { this.oscNode2.stop(); } catch { /* ignore */ }
      this.oscNode2.disconnect();
      this.oscNode2 = null;
    }
    if (this.noiseBufferNode) {
      try { this.noiseBufferNode.stop(); } catch { /* ignore */ }
      this.noiseBufferNode.disconnect();
      this.noiseBufferNode = null;
    }
    if (this.fileBufferSource) {
      try { this.fileBufferSource.stop(); } catch { /* ignore */ }
      this.fileBufferSource.disconnect();
      this.fileBufferSource = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach(t => t.stop());
      this.micStream = null;
    }
    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }
  }

  private startNoiseSource() {
    if (!this.ctx || !this.noiseGain) return;
    const sampleRate = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, sampleRate * 3, sampleRate);
    const data = buffer.getChannelData(0);

    // Pink / ambient environmental noise filter
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      data[i] = (b0 + b1 + b2 + b3 + b4 + white * 0.5) * 0.06;
    }

    this.noiseBufferNode = this.ctx.createBufferSource();
    this.noiseBufferNode.buffer = buffer;
    this.noiseBufferNode.loop = true;
    this.noiseBufferNode.connect(this.noiseGain);
    this.noiseBufferNode.start();
  }

  private startCalibrationTone() {
    if (!this.ctx || !this.cleanGain) return;
    this.oscNode1 = this.ctx.createOscillator();
    this.oscNode1.type = 'sine';
    this.oscNode1.frequency.value = 1000; // 1.0 kHz reference tone
    this.oscNode1.connect(this.cleanGain);
    this.oscNode1.start();
  }

  private startCleanSpeechSynthesis() {
    if (!this.ctx || !this.cleanGain) return;
    // Multi-harmonic acoustic generator simulating clean speech phoneme shifts
    this.oscNode1 = this.ctx.createOscillator();
    this.oscNode1.type = 'triangle';
    this.oscNode1.frequency.value = 220; // F0 pitch fundamental

    this.oscNode2 = this.ctx.createOscillator();
    this.oscNode2.type = 'sine';
    this.oscNode2.frequency.value = 880; // F1 formant

    this.oscNode1.connect(this.cleanGain);
    this.oscNode2.connect(this.cleanGain);
    this.oscNode1.start();
    this.oscNode2.start();

    // Natural formant movement
    this.modulationInterval = window.setInterval(() => {
      if (!this.ctx || !this.oscNode1 || !this.oscNode2) return;
      const now = this.ctx.currentTime;
      const f0 = 180 + Math.sin(now * 2.1) * 60 + Math.random() * 20;
      const f1 = 700 + Math.cos(now * 3.4) * 350 + Math.random() * 40;
      this.oscNode1.frequency.setTargetAtTime(f0, now, 0.06);
      this.oscNode2.frequency.setTargetAtTime(f1, now, 0.06);
    }, 120);
  }

  public async loadAudioFile(file: File) {
    this.init();
    if (!this.ctx) return;
    const arrayBuffer = await file.arrayBuffer();
    this.customAudioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
    this.startAudio('FILE_INPUT');
  }

  private playCustomBuffer() {
    if (!this.ctx || !this.customAudioBuffer || !this.cleanGain) return;
    this.fileBufferSource = this.ctx.createBufferSource();
    this.fileBufferSource.buffer = this.customAudioBuffer;
    this.fileBufferSource.loop = true;
    this.fileBufferSource.connect(this.cleanGain);
    this.fileBufferSource.start();
  }

  public getActiveAnalyser(): AnalyserNode | null {
    if (this.audioMode === 'INPUT') return this.inputAnalyser;
    if (this.audioMode === 'MIXED') return this.mixedAnalyser;
    return this.processedAnalyser;
  }

  public getInputAnalyser(): AnalyserNode | null {
    return this.inputAnalyser;
  }

  public getMixedAnalyser(): AnalyserNode | null {
    return this.mixedAnalyser;
  }

  public getProcessedAnalyser(): AnalyserNode | null {
    return this.processedAnalyser;
  }

  public getDspMetrics(): DspMetrics {
    if (!this.isRunning || !this.ctx) {
      return {
        isActive: false,
        signalLevelDb: null, // Will display '--'
        rmsDb: null,
        snrDb: null,
        frameCount: 0,
        bufferSize: 2048,
        sampleRate: 44100,
        processingStatus: 'IDLE'
      };
    }

    this.frameCounter += 1;
    const analyser = this.getActiveAnalyser();
    if (!analyser) {
      return {
        isActive: true,
        signalLevelDb: null,
        rmsDb: null,
        snrDb: this.targetSnrDb,
        frameCount: this.frameCounter,
        bufferSize: 2048,
        sampleRate: this.ctx.sampleRate,
        processingStatus: 'ACTIVE'
      };
    }

    const timeDomain = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(timeDomain);

    let sumSq = 0;
    let peak = 0;
    for (let i = 0; i < timeDomain.length; i++) {
      const val = timeDomain[i];
      sumSq += val * val;
      const absVal = Math.abs(val);
      if (absVal > peak) peak = absVal;
    }

    const rms = Math.sqrt(sumSq / timeDomain.length);
    const rmsDb = rms > 0.00001 ? 20 * Math.log10(rms) : -90;
    const peakDb = peak > 0.00001 ? 20 * Math.log10(peak) : -90;

    return {
      isActive: true,
      signalLevelDb: Math.round(peakDb * 10) / 10,
      rmsDb: Math.round(rmsDb * 10) / 10,
      snrDb: this.audioMode === 'INPUT' ? null : this.targetSnrDb,
      frameCount: this.frameCounter,
      bufferSize: analyser.fftSize,
      sampleRate: this.ctx.sampleRate,
      processingStatus: 'ACTIVE'
    };
  }
}

export const audioDspEngine = new AudioDspEngine();
