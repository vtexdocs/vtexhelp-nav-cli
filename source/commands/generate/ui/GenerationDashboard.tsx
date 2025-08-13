import React, { useState } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { StatsPanel } from './StatsPanel.js';
import { ProgressBar } from './ProgressBar.js';
import { LogViewer } from './LogViewer.js';
import { ErrorSummary } from './ErrorSummary.js';
import type { GenerationStats, LogEntry } from '../types.js';

interface Props {
  stats: GenerationStats;
  logs: LogEntry[];
  showVerbose?: boolean;
  onExit?: () => void;
}

const PHASE_ORDER = [
  'Initializing',
  'Directory Scanning',
  'Category Building',
  'Cross-language Linking',
  'Navigation Generation',
  'Special Sections',
  'Validation',
  'Complete'
];

export function GenerationDashboard({ stats, logs, showVerbose = false, onExit }: Props) {
  const { exit } = useApp();
  const [showHelp, setShowHelp] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  useInput((input, key) => {
    if (input === 'q' || key.escape) {
      if (onExit) {
        onExit();
      } else {
        exit();
      }
    } else if (input === 'h') {
      setShowHelp(!showHelp);
    } else if (input === 'e') {
      setShowErrors(!showErrors);
    }
  });

  const currentPhaseIndex = PHASE_ORDER.indexOf(stats.currentPhase);
  const progress = currentPhaseIndex >= 0 ? (currentPhaseIndex / (PHASE_ORDER.length - 1)) * 100 : 0;

  const errorLogs = logs.filter(log => log.level === 'error');
  const warningLogs = logs.filter(log => log.level === 'warn');

  return (
    <Box flexDirection="column" height="100%">
      {/* Header */}
      <Box borderStyle="double" paddingX={1} marginBottom={1}>
        <Box flexDirection="column" width="100%">
          <Text bold color="blue">
            🚀 VTEX Navigation Generator
          </Text>
          <Box justifyContent="space-between">
            <Text>
              Phase: <Text color="yellow">{stats.currentPhase}</Text>
            </Text>
            <Text>
              Elapsed: <Text color="green">{stats.elapsedTime}</Text>
            </Text>
          </Box>
        </Box>
      </Box>

      {/* Progress Bar */}
      <Box marginBottom={1}>
        <ProgressBar 
          progress={progress}
          currentPhase={stats.currentPhase}
          phases={PHASE_ORDER}
        />
      </Box>

      {/* Main Content Area */}
      <Box flexDirection="row" height="80%">
        {/* Left Panel - Stats */}
        <Box width="50%" paddingRight={1}>
          <StatsPanel stats={stats} />
        </Box>

        {/* Right Panel - Logs or Errors */}
        <Box width="50%" paddingLeft={1}>
          {showErrors ? (
            <ErrorSummary 
              errors={errorLogs}
              warnings={warningLogs}
            />
          ) : showVerbose ? (
            <LogViewer logs={logs} />
          ) : (
            <Box borderStyle="single" paddingX={1} height="100%">
              <Box flexDirection="column">
                <Text bold>📊 Current Activity</Text>
                <Box marginTop={1}>
                  <Text>
                    {stats.currentFile ? (
                      <>
                        Processing: <Text color="cyan">{stats.currentFile.split('/').pop()}</Text>
                      </>
                    ) : (
                      <Text color="gray">Waiting for next file...</Text>
                    )}
                  </Text>
                </Box>
                
                <Box marginTop={2}>
                  <Text bold>📈 Quick Stats</Text>
                  <Box flexDirection="column" marginTop={1}>
                    <Text>
                      Files: <Text color="green">{stats.processedFiles}</Text> / <Text color="blue">{stats.totalFiles}</Text>
                    </Text>
                    <Text>
                      Errors: <Text color="red">{stats.errors}</Text>
                    </Text>
                    <Text>
                      Warnings: <Text color="yellow">{stats.warnings}</Text>
                    </Text>
                  </Box>
                </Box>

                {stats.memoryUsage && (
                  <Box marginTop={2}>
                    <Text bold>💾 Memory</Text>
                    <Box marginTop={1}>
                      <Text>
                        {stats.memoryUsage.used}MB / {stats.memoryUsage.total}MB
                      </Text>
                    </Box>
                  </Box>
                )}
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      {/* Help Panel */}
      {showHelp && (
        <Box 
          borderStyle="double" 
          paddingX={1}
          marginTop={1}
        >
          <Box flexDirection="column">
            <Text bold color="yellow">🔧 Help</Text>
            <Box marginTop={1} flexDirection="column">
              <Text><Text color="green">h</Text> - Toggle this help</Text>
              <Text><Text color="green">e</Text> - Toggle error summary</Text>
              <Text><Text color="green">q/ESC</Text> - Exit</Text>
            </Box>
          </Box>
        </Box>
      )}

      {/* Footer */}
      <Box borderStyle="single" paddingX={1} marginTop={1}>
        <Box justifyContent="space-between">
          <Text>
            {stats.errors > 0 || stats.warnings > 0 ? (
              <Text>
                Press <Text color="green">e</Text> for errors
              </Text>
            ) : (
              <Text color="gray">No issues detected</Text>
            )}
          </Text>
          <Text>
            Press <Text color="green">h</Text> for help, <Text color="green">q</Text> to quit
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
