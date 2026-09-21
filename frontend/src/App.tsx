import React, { useState } from 'react';

import { SystemOverviewHeader } from './components/SystemOverviewHeader';
import { SidebarNavigation } from './components/SidebarNavigation';
import { LiveAudioWorkspace } from './components/LiveAudioWorkspace';
import { LiveAudioPanel } from './components/LiveAudioPanel';
import { TimeFrequencyAnalysis } from './components/TimeFrequencyAnalysis';
import { AudioProcessingFlow } from './components/AudioProcessingFlow';
import { DatasetPipelineView } from './components/DatasetPipelineView';
import { SnrAnalysisWorkspace } from './components/SnrAnalysisWorkspace';
import { DataAcquisitionTable } from './components/DataAcquisitionTable';
import { QualityReportingPanel } from './components/QualityReportingPanel';
import { AudioProcessingModule } from './components/AudioProcessingModule';
import NoiseIntelligencePanel from './components/NoiseIntelligencePanel';
import { SystemLogsPanel } from './components/SystemLogsPanel';

import { AudioSessionProvider } from './context/AudioSessionContext';
import LandingPage from './components/LandingPage';

export default function App() {

  /*
   * ============================================================
   * LANDING PAGE
   * ============================================================
   */

  const [showLanding, setShowLanding] =
    useState<boolean>(true);

  /*
   * ============================================================
   * DASHBOARD STATE
   * ============================================================
   */

  const [currentTab, setCurrentTab] =
    useState<string>('LIVE_AUDIO');

  const [isRunning, setIsRunning] =
    useState<boolean>(false);

  const [sidebarOpen, setSidebarOpen] =
    useState<boolean>(true);

  /*
   * ============================================================
   * ENTER NIRVAN SYSTEM
   * ============================================================
   */

  const handleEnterSystem = () => {
    setShowLanding(false);
  };

  /*
   * ============================================================
   * LANDING PAGE
   * ============================================================
   */

  if (showLanding) {
    return (
      <LandingPage
        onEnter={handleEnterSystem}
      />
    );
  }

  /*
   * ============================================================
   * MAIN NIRVAN CONSOLE
   * ============================================================
   */

  return (
    <AudioSessionProvider>

      <div className="w-screen h-screen flex flex-col bg-[#080B08] text-[#E0E5DC] font-mono select-none overflow-hidden">

        {/* =====================================================
            TOP HEADER
        ====================================================== */}

        <SystemOverviewHeader
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          isRunning={isRunning}
          onToggleRun={() =>
            setIsRunning(
              (previous) =>
                !previous
            )
          }
          onToggleSidebar={() =>
            setSidebarOpen(
              (previous) =>
                !previous
            )
          }
        />

        {/* =====================================================
            MAIN WORKSPACE
        ====================================================== */}

        <div className="flex-1 flex min-h-0 overflow-hidden">

          {/* ===================================================
              SIDEBAR
          =================================================== */}

          <SidebarNavigation
            currentTab={currentTab}
            onSelectTab={setCurrentTab}
            isOpen={sidebarOpen}
            onToggle={() =>
              setSidebarOpen(
                (previous) =>
                  !previous
              )
            }
          />

          {/* ===================================================
              CONTENT
          =================================================== */}

          <main className="flex-1 min-h-0 overflow-y-auto p-2.5 sm:p-3.5 space-y-3 bg-[#080B08]">

            {/* =================================================
                LIVE AUDIO WORKSPACE
            ================================================= */}

            <div
              className={
                currentTab ===
                'LIVE_AUDIO'
                  ? 'block max-w-[1500px] mx-auto space-y-3'
                  : 'hidden'
              }
            >
              <LiveAudioWorkspace />
            </div>

            {/* =================================================
                OVERVIEW
            ================================================= */}

            {currentTab === 'OVERVIEW' && (
              <div className="space-y-3 max-w-[1600px] mx-auto">

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">

                  <LiveAudioPanel
                    isRunning={isRunning}
                  />

                  <TimeFrequencyAnalysis
                    isRunning={isRunning}
                  />

                </div>

                <AudioProcessingFlow
                  isRunning={isRunning}
                />

                <SnrAnalysisWorkspace
                  isRunning={isRunning}
                />

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">

                  <DataAcquisitionTable />

                  <QualityReportingPanel />

                </div>

                <DatasetPipelineView />

              </div>
            )}

            {/* =================================================
                SIGNAL ANALYSIS
            ================================================= */}

            {currentTab === 'SIGNAL_ANALYSIS' && (
              <div className="max-w-[1400px] mx-auto space-y-3">

                <TimeFrequencyAnalysis
                  isRunning={isRunning}
                />

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">

                  <LiveAudioPanel
                    isRunning={isRunning}
                  />

                  <AudioProcessingModule
                    isRunning={isRunning}
                  />

                </div>

              </div>
            )}

            {/* =================================================
                NOISE INTELLIGENCE
            ================================================= */}

            {currentTab === 'NOISE_INTELLIGENCE' && (
              <div className="max-w-[1400px] mx-auto space-y-3">

                <NoiseIntelligencePanel />

              </div>
            )}

            {/* =================================================
                DATA ACQUISITION
            ================================================= */}

            {currentTab === 'DATA_ACQUISITION' && (
              <div className="max-w-[1400px] mx-auto space-y-3">

                <DataAcquisitionTable />

                <DatasetPipelineView />

              </div>
            )}

            {/* =================================================
                SNR ANALYSIS
            ================================================= */}

            {currentTab === 'SNR_ANALYSIS' && (
              <div className="max-w-[1400px] mx-auto space-y-3">

                <SnrAnalysisWorkspace
                  isRunning={isRunning}
                />

                <AudioProcessingModule
                  isRunning={isRunning}
                />

              </div>
            )}

            {/* =================================================
                DATASET PIPELINE
            ================================================= */}

            {currentTab === 'DATASET_PIPELINE' && (
              <div className="max-w-[1400px] mx-auto space-y-3">

                <DatasetPipelineView />

                <DataAcquisitionTable />

              </div>
            )}

            {/* =================================================
                QUALITY REPORTING
            ================================================= */}

            {currentTab === 'QUALITY_REPORTING' && (
              <div className="max-w-[1400px] mx-auto space-y-3">

                <QualityReportingPanel />

                <DatasetPipelineView />

              </div>
            )}

            {/* =================================================
                PROCESSING STATUS
            ================================================= */}

            {currentTab === 'PROCESSING_STATUS' && (
              <div className="max-w-[1400px] mx-auto space-y-3">

                <AudioProcessingFlow
                  isRunning={isRunning}
                />

                <AudioProcessingModule
                  isRunning={isRunning}
                />

              </div>
            )}

            {/* =================================================
                LOGS
            ================================================= */}

            {currentTab === 'LOGS' && (
              <div className="max-w-[1400px] mx-auto space-y-3">

                <SystemLogsPanel />

              </div>
            )}

          </main>
        </div>

        {/* =====================================================
            FOOTER
        ====================================================== */}

        <footer className="px-3 py-1.5 bg-[#070907] border-t border-[#1C231A] text-[10px] text-[#6A7860] flex flex-wrap items-center justify-between font-mono shrink-0">

          <div className="flex items-center space-x-3">

            <span>
              NIRVAN DEFENCE AUDIO INTELLIGENCE
            </span>

            <span>•</span>

            <span>
              PIPELINE: dataset_builder.py
            </span>

            <span>•</span>

            <span>
              MIXER: mix_audio.py
            </span>

            <span>•</span>

            <span>
              API: POST /api/audio/process
            </span>

          </div>

          <div className="flex items-center space-x-2">

            <span>
              STANDARDIZATION: 16 kHz / 44.1 kHz PCM
            </span>

            <span>•</span>

            <span className="text-[#8B9C72]">
              NIRVAN ENGINE: READY
            </span>

          </div>

        </footer>

      </div>

    </AudioSessionProvider>
  );
}