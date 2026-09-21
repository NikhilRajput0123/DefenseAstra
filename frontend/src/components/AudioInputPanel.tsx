import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  Square,
  Mic,
  Trash2,
  Upload,
} from 'lucide-react';

import {
  audioRecorderService,
  RecordingMetadata,
} from '../services/audioRecorder';

interface AudioInputPanelProps {
  onRecordingComplete: (metadata: RecordingMetadata) => void;
  onClearRecording: () => void;
  recordingMetadata: RecordingMetadata | null;
}

export const AudioInputPanel: React.FC<AudioInputPanelProps> = ({
  onRecordingComplete,
  onClearRecording,
  recordingMetadata,
}) => {
  const [status, setStatus] = useState<
    'READY' | 'RECORDING' | 'PAUSED' | 'RECORDED'
  >('READY');

  const [seconds, setSeconds] = useState<number>(0);
  const [isPlayingRecorded, setIsPlayingRecorded] =
    useState<boolean>(false);
  const [audioPlaybackTime, setAudioPlaybackTime] =
    useState<number>(0);

  const fileInputRef =
    useRef<HTMLInputElement | null>(null);

  const liveCanvasRef =
    useRef<HTMLCanvasElement | null>(null);

  const staticCanvasRef =
    useRef<HTMLCanvasElement | null>(null);

  const audioElementRef =
    useRef<HTMLAudioElement | null>(null);

  // ============================================================
  // LIVE MICROPHONE WAVEFORM
  // ============================================================

  useEffect(() => {
    let animId: number;

    const drawLiveWaveform = () => {
      const canvas = liveCanvasRef.current;

      if (!canvas) {
        animId =
          requestAnimationFrame(drawLiveWaveform);
        return;
      }

      const ctx = canvas.getContext('2d');

      if (!ctx) {
        animId =
          requestAnimationFrame(drawLiveWaveform);
        return;
      }

      const width = canvas.width;
      const height = canvas.height;

      ctx.fillStyle = '#090C09';
      ctx.fillRect(
        0,
        0,
        width,
        height
      );

      // Center line
      ctx.strokeStyle = '#1A2218';
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.moveTo(
        0,
        height / 2
      );
      ctx.lineTo(
        width,
        height / 2
      );
      ctx.stroke();

      // Live microphone waveform
      if (status === 'RECORDING') {
        const timeData =
          audioRecorderService.getLiveTimeDomainData();

        if (timeData) {
          ctx.strokeStyle = '#A4BA75';
          ctx.lineWidth = 1.5;

          ctx.beginPath();

          const sliceWidth =
            width / timeData.length;

          let x = 0;

          for (
            let i = 0;
            i < timeData.length;
            i++
          ) {
            const v = timeData[i];

            const y =
              height / 2 -
              v * (height * 0.45);

            if (i === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }

            x += sliceWidth;
          }

          ctx.stroke();
        }
      } else {
        // Standby line
        ctx.strokeStyle = '#283324';
        ctx.lineWidth = 1;

        ctx.beginPath();
        ctx.moveTo(
          0,
          height / 2
        );
        ctx.lineTo(
          width,
          height / 2
        );
        ctx.stroke();
      }

      animId =
        requestAnimationFrame(
          drawLiveWaveform
        );
    };

    animId =
      requestAnimationFrame(
        drawLiveWaveform
      );

    return () =>
      cancelAnimationFrame(animId);
  }, [status]);

  // ============================================================
  // STATIC WAVEFORM
  // ============================================================

  useEffect(() => {
    const canvas =
      staticCanvasRef.current;

    if (
      !canvas ||
      !recordingMetadata?.audioBuffer
    ) {
      return;
    }

    const ctx =
      canvas.getContext('2d');

    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = '#090C09';

    ctx.fillRect(
      0,
      0,
      width,
      height
    );

    // Center line
    ctx.strokeStyle = '#1A2218';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(
      0,
      height / 2
    );
    ctx.lineTo(
      width,
      height / 2
    );
    ctx.stroke();

    const channelData =
      recordingMetadata.audioBuffer
        .getChannelData(0);

    const step = Math.max(
      1,
      Math.ceil(
        channelData.length / width
      )
    );

    const amp =
      height * 0.44;

    ctx.fillStyle = '#879260';

    for (
      let i = 0;
      i < width;
      i++
    ) {
      let min = 1.0;
      let max = -1.0;

      for (
        let j = 0;
        j < step;
        j++
      ) {
        const index =
          i * step + j;

        if (
          index >=
          channelData.length
        ) {
          break;
        }

        const datum =
          channelData[index];

        if (datum < min) {
          min = datum;
        }

        if (datum > max) {
          max = datum;
        }
      }

      const yMin =
        height / 2 +
        min * amp;

      const yMax =
        height / 2 +
        max * amp;

      ctx.fillRect(
        i,
        yMin,
        1,
        Math.max(
          1,
          yMax - yMin
        )
      );
    }
  }, [recordingMetadata]);

  // ============================================================
  // START MICROPHONE RECORDING
  // ============================================================

  const handleStartRecording =
    async () => {
      try {
        await audioRecorderService.startRecording(
          (sec) =>
            setSeconds(sec),

          (st) =>
            setStatus(st)
        );
      } catch (err) {
        console.error(
          'Microphone recording error:',
          err
        );

        alert(
          'Could not access microphone. Please ensure microphone permissions are granted in your browser.'
        );
      }
    };

  // ============================================================
  // PAUSE / RESUME
  // ============================================================

  const handlePauseResume =
    () => {
      if (
        status === 'RECORDING'
      ) {
        audioRecorderService.pauseRecording();

        setStatus('PAUSED');
      } else if (
        status === 'PAUSED'
      ) {
        audioRecorderService.resumeRecording();

        setStatus('RECORDING');
      }
    };

  // ============================================================
  // STOP MICROPHONE RECORDING
  // ============================================================

  const handleStopRecording =
    async () => {
      try {
        const meta =
          await audioRecorderService.stopRecording();

        setStatus('RECORDED');

        onRecordingComplete(meta);
      } catch (error) {
        console.error(
          'Stop recording error:',
          error
        );

        alert(
          'Could not finish the recording.'
        );
      }
    };

  // ============================================================
  // UPLOAD WAV FILE
  // ============================================================

  const handleUploadWav =
    async (
      event: React.ChangeEvent<HTMLInputElement>
    ) => {
      const file =
        event.target.files?.[0];

      if (!file) return;

      try {
        // Validate WAV
        if (
          !file.name
            .toLowerCase()
            .endsWith('.wav')
        ) {
          alert(
            'Please select a WAV audio file.'
          );

          event.target.value = '';
          return;
        }

        // Read WAV
        const arrayBuffer =
          await file.arrayBuffer();

        // Decode audio
        const audioContext =
          new AudioContext();

        const audioBuffer =
          await audioContext.decodeAudioData(
            arrayBuffer.slice(0)
          );

        // Browser playback URL
        const audioUrl =
          URL.createObjectURL(
            file
          );

        const durationSeconds =
          audioBuffer.duration;

        const sampleRate =
          audioBuffer.sampleRate;

        const channels =
          audioBuffer.numberOfChannels;

        /*
         * IMPORTANT:
         * Only use fields that actually exist
         * inside RecordingMetadata.
         */
        const uploadedMetadata =
          {
            audioBuffer,
            audioUrl,
            durationSeconds,
            sampleRate,
            channels,
          } as RecordingMetadata;

        setSeconds(
          Math.floor(
            durationSeconds
          )
        );

        setStatus('RECORDED');

        onRecordingComplete(
          uploadedMetadata
        );

        await audioContext.close();
      } catch (error) {
        console.error(
          'WAV upload/decode error:',
          error
        );

        alert(
          'Could not read this WAV file. Please select a valid WAV audio file.'
        );
      } finally {
        event.target.value = '';
      }
    };

  // ============================================================
  // CLEAR
  // ============================================================

  const handleClear = () => {
    audioRecorderService.clear();

    setStatus('READY');
    setSeconds(0);
    setIsPlayingRecorded(false);
    setAudioPlaybackTime(0);

    if (
      audioElementRef.current
    ) {
      audioElementRef.current.pause();

      audioElementRef.current.currentTime = 0;
    }

    onClearRecording();
  };

  // ============================================================
  // PLAY / PAUSE AUDIO
  // ============================================================

  const togglePlayAudio =
    () => {
      const audio =
        audioElementRef.current;

      if (!audio) return;

      if (
        isPlayingRecorded
      ) {
        audio.pause();

        setIsPlayingRecorded(
          false
        );
      } else {
        audio
          .play()
          .then(() => {
            setIsPlayingRecorded(
              true
            );
          })
          .catch((error) => {
            console.error(
              'Audio playback error:',
              error
            );
          });
      }
    };

  // ============================================================
  // FORMAT TIME
  // ============================================================

  const formatTime = (
    totalSeconds: number
  ) => {
    const mins =
      Math.floor(
        totalSeconds / 60
      );

    const secs =
      totalSeconds % 60;

    return `${mins
      .toString()
      .padStart(
        2,
        '0'
      )}:${secs
      .toString()
      .padStart(
        2,
        '0'
      )}`;
  };

  // ============================================================
  // UI
  // ============================================================

  return (
    <div className="bg-[#0B0E0B] border border-[#232B20] p-3 font-mono text-xs flex flex-col">

      {/* Hidden WAV input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".wav,audio/wav"
        className="hidden"
        onChange={
          handleUploadWav
        }
      />

      {/* Audio player */}
      {recordingMetadata?.audioUrl && (
        <audio
          ref={audioElementRef}
          src={
            recordingMetadata.audioUrl
          }
          onTimeUpdate={(e) =>
            setAudioPlaybackTime(
              e.currentTarget
                .currentTime
            )
          }
          onEnded={() => {
            setIsPlayingRecorded(
              false
            );

            setAudioPlaybackTime(
              0
            );
          }}
        />
      )}

      {/* ======================================================
          HEADER
      ====================================================== */}

      <div className="flex flex-wrap items-center justify-between pb-2 mb-3 border-b border-[#1F261C]">

        <div className="flex items-center space-x-2">

          <span className="w-2 h-2 bg-[#69754B]" />

          <span className="font-bold text-[#E2E6DF] tracking-wider uppercase">
            AUDIO INPUT
          </span>

          <span className="text-[10px] text-[#717C67]">
            [ACOUSTIC TRANSDUCER]
          </span>

        </div>

        <div className="flex items-center space-x-2">

          <span className="text-[10px] text-[#717C67]">
            STATUS:
          </span>

          <span
            className={`px-2 py-0.5 border text-[10px] font-semibold ${
              status ===
              'RECORDING'
                ? 'bg-[#2A1818] border-[#662828] text-[#E08A8A] animate-pulse'
                : status ===
                  'RECORDED'
                ? 'bg-[#152014] border-[#2C3E26] text-[#A4BA75]'
                : 'bg-[#101410] border-[#232B20] text-[#78856F]'
            }`}
          >
            {status}
          </span>

        </div>
      </div>

      {/* ======================================================
          METADATA
      ====================================================== */}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 text-[11px]">

        <div className="bg-[#0E120E] p-2 border border-[#1E251B]">

          <div className="text-[#68735F] text-[9px] uppercase">
            SOURCE
          </div>

          <div className="font-bold text-[#D0D6CA] mt-0.5 flex items-center space-x-1">

            <Mic className="w-3 h-3 text-[#879260]" />

            <span>
              {recordingMetadata
                ? 'WAV FILE'
                : 'MICROPHONE'}
            </span>

          </div>

        </div>

        <div className="bg-[#0E120E] p-2 border border-[#1E251B]">

          <div className="text-[#68735F] text-[9px] uppercase">
            DURATION
          </div>

          <div className="font-bold text-[#D0D6CA] mt-0.5">

            {status ===
              'RECORDING' ||
            status ===
              'PAUSED'
              ? formatTime(
                  seconds
                )
              : recordingMetadata?.durationSeconds
              ? `${recordingMetadata.durationSeconds.toFixed(
                  2
                )}s`
              : '--'}

          </div>

        </div>

        <div className="bg-[#0E120E] p-2 border border-[#1E251B]">

          <div className="text-[#68735F] text-[9px] uppercase">
            SAMPLE RATE
          </div>

          <div className="font-bold text-[#D0D6CA] mt-0.5">

            {recordingMetadata?.sampleRate
              ? `${recordingMetadata.sampleRate} Hz`
              : '--'}

          </div>

        </div>

        <div className="bg-[#0E120E] p-2 border border-[#1E251B]">

          <div className="text-[#68735F] text-[9px] uppercase">
            CHANNELS
          </div>

          <div className="font-bold text-[#D0D6CA] mt-0.5">

            {recordingMetadata?.channels
              ? `${recordingMetadata.channels}`
              : '--'}

          </div>

        </div>

      </div>

      {/* ======================================================
          WAVEFORM
      ====================================================== */}

      <div className="relative mb-3 border border-[#1C241A] bg-[#090C09] overflow-hidden">

        {status ===
        'RECORDED' ? (

          <div className="relative h-28 sm:h-32">

            <canvas
              ref={
                staticCanvasRef
              }
              width={800}
              height={128}
              className="w-full h-full block"
            />

            <div className="absolute top-2 left-2 px-2 py-0.5 bg-[#0D120D]/90 border border-[#263122] text-[9px] text-[#869473]">
              UPLOADED / RECORDED AUDIO
            </div>

            {audioElementRef
              .current
              ?.duration ? (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-[#C2D88C]"
                style={{
                  left: `${
                    (audioPlaybackTime /
                      audioElementRef
                        .current
                        .duration) *
                    100
                  }%`,
                }}
              />
            ) : null}

          </div>

        ) : (

          <div className="relative h-28 sm:h-32">

            <canvas
              ref={
                liveCanvasRef
              }
              width={800}
              height={128}
              className="w-full h-full block"
            />

            <div className="absolute top-2 left-2 px-2 py-0.5 bg-[#0D120D]/90 border border-[#263122] text-[9px] text-[#869473]">

              {status ===
              'RECORDING'
                ? 'LIVE MICROPHONE TRANSDUCER'
                : 'STANDBY TRANSDUCER'}

            </div>

          </div>

        )}

      </div>

      {/* ======================================================
          ACTION BUTTONS
      ====================================================== */}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#1C241A]">

        <div className="flex flex-wrap items-center gap-2">

          {/* START RECORDING */}

          {status ===
            'READY' && (
            <button
              id="btn-start-recording"
              onClick={
                handleStartRecording
              }
              className="flex items-center space-x-2 px-3 py-1.5 bg-[#2A1616] border border-[#6B2828] text-[#ECAAAA] hover:bg-[#381B1B] font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-[#E54848] animate-pulse" />

              <span>
                START RECORDING
              </span>
            </button>
          )}

          {/* UPLOAD WAV */}

          {status ===
            'READY' && (
            <button
              id="btn-upload-wav"
              onClick={() =>
                fileInputRef.current?.click()
              }
              className="flex items-center space-x-2 px-3 py-1.5 bg-[#151D13] border border-[#405334] text-[#BFD69B] hover:bg-[#1C2818] font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />

              <span>
                UPLOAD WAV
              </span>
            </button>
          )}

          {/* RECORDING / PAUSED */}

          {(status ===
            'RECORDING' ||
            status ===
              'PAUSED') && (
            <>
              <div className="px-2.5 py-1 bg-[#161C14] border border-[#263321] text-[#A4BA75] font-bold text-xs flex items-center space-x-2">

                <span className="w-2 h-2 rounded-full bg-[#A4BA75] animate-pulse" />

                <span>
                  RECORDING:{' '}
                  {formatTime(
                    seconds
                  )}
                </span>

              </div>

              <button
                id="btn-pause-recording"
                onClick={
                  handlePauseResume
                }
                className="px-2.5 py-1.5 bg-[#141A13] border border-[#283623] text-[#CBD4C2] hover:bg-[#1C261B] text-xs transition-colors cursor-pointer"
              >
                {status ===
                'RECORDING'
                  ? 'PAUSE'
                  : 'RESUME'}
              </button>

              <button
                id="btn-stop-recording"
                onClick={
                  handleStopRecording
                }
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#382618] border border-[#7A4822] text-[#E8C2A0] hover:bg-[#48301E] font-bold text-xs uppercase transition-colors cursor-pointer"
              >
                <Square className="w-3 h-3 fill-current" />

                <span>
                  STOP
                </span>
              </button>
            </>
          )}

          {/* RECORDED */}

          {status ===
            'RECORDED' && (
            <>
              <button
                id="btn-clear-recording"
                onClick={
                  handleClear
                }
                className="flex items-center space-x-1 px-2.5 py-1.5 bg-[#141814] border border-[#242C22] text-[#86927C] hover:text-[#C5CDC0] text-xs transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />

                <span>
                  CLEAR
                </span>
              </button>

              <button
                id="btn-upload-another-wav"
                onClick={() =>
                  fileInputRef.current?.click()
                }
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#151D13] border border-[#405334] text-[#BFD69B] hover:bg-[#1C2818] font-bold text-xs uppercase transition-colors cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />

                <span>
                  CHANGE WAV
                </span>
              </button>
            </>
          )}

        </div>

        {/* PLAYBACK */}

        {status ===
          'RECORDED' && (
          <div className="flex items-center space-x-3 bg-[#0E130E] border border-[#20291D] px-3 py-1">

            <button
              id="btn-play-recorded"
              onClick={
                togglePlayAudio
              }
              className="flex items-center space-x-1.5 text-[#C4D89A] hover:text-[#E2F0B8] font-bold text-xs cursor-pointer"
            >

              {isPlayingRecorded ? (
                <>
                  <Pause className="w-3.5 h-3.5 fill-current" />

                  <span>
                    PAUSE
                  </span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />

                  <span>
                    PLAY
                  </span>
                </>
              )}

            </button>

            <span className="text-[10px] text-[#6F7B66]">
              {audioElementRef
                .current
                ?.duration
                ? `${audioPlaybackTime.toFixed(
                    1
                  )}s / ${audioElementRef.current.duration.toFixed(
                    1
                  )}s`
                : '--'}
            </span>

          </div>
        )}

      </div>

    </div>
  );
};