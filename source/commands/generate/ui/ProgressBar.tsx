import React from 'react';
import { Box, Text } from 'ink';

interface Props {
  progress: number; // 0-100
  currentPhase: string;
  phases: string[];
}

export function ProgressBar({ progress, currentPhase, phases }: Props) {
  // Dynamic bar width based on available space (roughly 80% of typical terminal width)
  const barWidth = Math.min(100, Math.max(60, process.stdout.columns ? Math.floor(process.stdout.columns * 0.8) : 80));
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

        {/* Phase Indicators - Single row with very short names */}
        <Box flexDirection="row" flexWrap="nowrap" gap={0}>
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

            // Ultra-short phase names to prevent overflow
            const shortNames: Record<string, string> = {
              'Initializing': 'Init',
              'Directory Scanning': 'Scan',
              'Category Building': 'Build', 
              'Cross-language Linking': 'Link',
              'Navigation Generation': 'Nav',
              'Special Sections': 'Spec',
              'Validation': 'Valid',
              'Complete': 'Done'
            };
            
            const shortName = shortNames[phase] || phase.substring(0, 4);

            return (
              <Text key={phase} color={color}>
                {icon} {shortName}{index < phases.length - 1 ? '   ' : ''}
              </Text>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}
