import React from 'react';
import { Box, Text } from 'ink';

interface Props {
  progress: number; // 0-100
  currentPhase: string;
  phases: string[];
}

export function ProgressBar({ progress, currentPhase, phases }: Props) {
  const barWidth = 40;
  const filledWidth = Math.round((progress / 100) * barWidth);
  const emptyWidth = barWidth - filledWidth;

  // Create visual progress bar
  const filledBar = '█'.repeat(filledWidth);
  const emptyBar = '░'.repeat(emptyWidth);

  return (
    <Box borderStyle="single" paddingX={1}>
      <Box flexDirection="column" width="100%">
        <Box justifyContent="space-between" marginBottom={1}>
          <Text bold>🔄 Progress</Text>
          <Text>
            <Text color="green">{Math.round(progress)}%</Text>
          </Text>
        </Box>

        {/* Progress Bar */}
        <Box marginBottom={1}>
          <Text color="green">{filledBar}</Text>
          <Text color="gray">{emptyBar}</Text>
        </Box>

        {/* Phase Indicators */}
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          {phases.map((phase, index) => {
            let status: 'completed' | 'current' | 'pending' = 'pending';
            
            if (phase === currentPhase) {
              status = 'current';
            } else if (phases.indexOf(currentPhase) > index) {
              status = 'completed';
            }

            let color = 'gray';
            let icon = '○';
            
            switch (status) {
              case 'completed':
                color = 'green';
                icon = '●';
                break;
              case 'current':
                color = 'yellow';
                icon = '◐';
                break;
              case 'pending':
                color = 'gray';
                icon = '○';
                break;
            }

            return (
              <Box key={phase} marginRight={2}>
                <Text color={color}>
                  {icon} {phase.replace(/([A-Z])/g, ' $1').trim()}
                </Text>
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}
