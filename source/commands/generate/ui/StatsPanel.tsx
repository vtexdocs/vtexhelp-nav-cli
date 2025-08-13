import React from 'react';
import { Box, Text } from 'ink';
import type { GenerationStats } from '../types.js';

interface Props {
  stats: GenerationStats;
}

export function StatsPanel({ stats }: Props) {
  const completionPercentage = stats.totalFiles > 0 
    ? Math.round((stats.processedFiles / stats.totalFiles) * 100) 
    : 0;

  const statusColor = stats.errors > 0 ? 'red' : stats.warnings > 0 ? 'yellow' : 'green';

  return (
    <Box borderStyle="single" paddingX={1} height="100%">
      <Box flexDirection="column">
        <Text bold>📈 Generation Statistics</Text>

        {/* Progress Section */}
        <Box marginTop={1} marginBottom={1}>
          <Box flexDirection="column">
            <Text bold>Progress</Text>
            <Box marginTop={1}>
              <Text>
                Files: <Text color="green">{stats.processedFiles}</Text> / <Text color="blue">{stats.totalFiles}</Text>
                {stats.totalFiles > 0 && (
                  <Text> (<Text color={statusColor}>{completionPercentage}%</Text>)</Text>
                )}
              </Text>
            </Box>
          </Box>
        </Box>

        {/* Languages Section */}
        {Object.keys(stats.languages).length > 0 && (
          <Box marginBottom={1}>
            <Box flexDirection="column">
              <Text bold>📚 Languages</Text>
              <Box marginTop={1} flexDirection="column">
                {Object.entries(stats.languages)
                  .sort(([, a], [, b]) => b - a)
                  .map(([lang, count]) => (
                    <Text key={lang}>
                      <Text color="cyan">{lang.toUpperCase()}</Text>: {count} files
                    </Text>
                  ))}
              </Box>
            </Box>
          </Box>
        )}

        {/* Sections */}
        {Object.keys(stats.sections).length > 0 && (
          <Box marginBottom={1}>
            <Box flexDirection="column">
              <Text bold>📁 Sections</Text>
              <Box marginTop={1} flexDirection="column">
                {Object.entries(stats.sections)
                  .sort(([, a], [, b]) => b - a)
                  .map(([section, count]) => (
                    <Text key={section}>
                      <Text color="magenta">{section}</Text>: {count} files
                    </Text>
                  ))}
              </Box>
            </Box>
          </Box>
        )}

        {/* Issues Section */}
        <Box marginBottom={1}>
          <Box flexDirection="column">
            <Text bold>⚠️ Issues</Text>
            <Box marginTop={1} flexDirection="column">
              <Text>
                Errors: <Text color="red">{stats.errors}</Text>
              </Text>
              <Text>
                Warnings: <Text color="yellow">{stats.warnings}</Text>
              </Text>
            </Box>
          </Box>
        </Box>

        {/* Performance Section */}
        <Box>
          <Box flexDirection="column">
            <Text bold>⚡ Performance</Text>
            <Box marginTop={1} flexDirection="column">
              <Text>
                Runtime: <Text color="green">{stats.elapsedTime}</Text>
              </Text>
              {stats.memoryUsage && (
                <Text>
                  Memory: <Text color="blue">{stats.memoryUsage.used}MB</Text>
                  <Text color="gray"> / {stats.memoryUsage.total}MB</Text>
                </Text>
              )}
              {stats.processedFiles > 0 && stats.elapsedTime !== '0s' && (
                <Text>
                  Speed: <Text color="cyan">
                    {Math.round(stats.processedFiles / (parseInt(stats.elapsedTime) || 1))} files/s
                  </Text>
                </Text>
              )}
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
