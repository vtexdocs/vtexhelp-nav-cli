import React from 'react';
import { Box, Text } from 'ink';
import type { LogEntry } from '../types.js';

interface Props {
  errors: LogEntry[];
  warnings: LogEntry[];
}

export function ErrorSummary({ errors, warnings }: Props) {
  const totalIssues = errors.length + warnings.length;

  return (
    <Box borderStyle="single" paddingX={1} height="100%">
      <Box flexDirection="column" height="100%">
        <Box justifyContent="space-between" marginBottom={1}>
          <Text bold>⚠️ Issues Summary</Text>
          <Text>
            <Text color="red">{errors.length}</Text>
            <Text color="gray"> + </Text>
            <Text color="yellow">{warnings.length}</Text>
            <Text color="gray"> = </Text>
            <Text color="blue">{totalIssues}</Text>
          </Text>
        </Box>

        {totalIssues === 0 ? (
          <Box justifyContent="center" alignItems="center" height="50%">
            <Text color="green">✅ No issues detected!</Text>
          </Box>
        ) : (
          <Box flexDirection="column">
            {/* Errors Section */}
            {errors.length > 0 && (
              <Box marginBottom={2}>
                <Box flexDirection="column">
                  <Text bold color="red">❌ Errors ({errors.length})</Text>
                  <Box marginTop={1} flexDirection="column">
                    {errors.slice(-10).map((error, index) => (
                      <Box key={index} marginBottom={1}>
                        <Box flexDirection="column">
                          <Text color="red">• {error.message}</Text>
                          {error.file && (
                            <Text color="gray" dimColor>
                              File: {error.file.split('/').pop()}
                            </Text>
                          )}
                          {error.context && (
                            <Text color="gray" dimColor>
                              Context: {JSON.stringify(error.context, null, 0)}
                            </Text>
                          )}
                        </Box>
                      </Box>
                    ))}
                    {errors.length > 10 && (
                      <Text color="gray">
                        ... and {errors.length - 10} more errors
                      </Text>
                    )}
                  </Box>
                </Box>
              </Box>
            )}

            {/* Warnings Section */}
            {warnings.length > 0 && (
              <Box>
                <Box flexDirection="column">
                  <Text bold color="yellow">⚠️ Warnings ({warnings.length})</Text>
                  <Box marginTop={1} flexDirection="column">
                    {warnings.slice(-10).map((warning, index) => (
                      <Box key={index} marginBottom={1}>
                        <Box flexDirection="column">
                          <Text color="yellow">• {warning.message}</Text>
                          {warning.file && (
                            <Text color="gray" dimColor>
                              File: {warning.file.split('/').pop()}
                            </Text>
                          )}
                          {warning.context && (
                            <Text color="gray" dimColor>
                              Context: {JSON.stringify(warning.context, null, 0)}
                            </Text>
                          )}
                        </Box>
                      </Box>
                    ))}
                    {warnings.length > 10 && (
                      <Text color="gray">
                        ... and {warnings.length - 10} more warnings
                      </Text>
                    )}
                  </Box>
                </Box>
              </Box>
            )}
          </Box>
        )}

        {/* Footer */}
        {totalIssues > 0 && (
          <Box marginTop={1}>
            <Text color="gray">
              Showing latest 10 of each type. Check verbose logs for details.
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
