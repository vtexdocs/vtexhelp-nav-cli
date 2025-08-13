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

export function GenerationDashboard({ stats, logs, showVerbose = true, onExit }: Props) {
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
  // Adjust progress calculation to reach 100% on Complete phase
  let progress = 0;
  if (currentPhaseIndex >= 0) {
    if (stats.currentPhase === 'Complete') {
      progress = 100;
    } else {
      // Calculate progress based on phase completion
      progress = ((currentPhaseIndex + 0.5) / PHASE_ORDER.length) * 100;
      // If we're in validation and it's completed, show higher progress
      if (stats.currentPhase === 'Validation' && logs.some(log => log.message.includes('validation passed'))) {
        progress = 95; // Near completion
      }
    }
  }

  const errorLogs = logs.filter(log => log.level === 'error');
  const warningLogs = logs.filter(log => log.level === 'warn');
  
  // Debug: Check if stats show issues but logs are empty (only in development)
  if (process.env['NODE_ENV'] === 'development' && (stats.errors > 0 || stats.warnings > 0) && errorLogs.length === 0 && warningLogs.length === 0) {
    console.error('DEBUG: Stats show issues but no error/warning logs found', {
      statsErrors: stats.errors,
      statsWarnings: stats.warnings, 
      totalLogs: logs.length,
      logLevels: logs.map(l => l.level)
    });
  }

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
        <Box width="49%" marginRight={1}>
          <StatsPanel stats={stats} />
        </Box>

        {/* Right Panel - Logs or Errors */}
        <Box width="49%" marginLeft={1}>
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
                        Processing: <Text color="cyan">{stats.currentFile.split('/').pop()?.substring(0, 30) || 'file'}...</Text>
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
