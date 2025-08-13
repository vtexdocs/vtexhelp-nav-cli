import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { LogEntry, LogLevel } from '../types.js';

interface Props {
  logs: LogEntry[];
}

export function LogViewer({ logs }: Props) {
  const [scrollOffset, setScrollOffset] = useState(0);
  const [filterLevel, setFilterLevel] = useState<LogLevel | 'all'>('all');

  useInput((input, key) => {
    // Scroll up/down
    if (key.upArrow) {
      setScrollOffset(Math.max(0, scrollOffset - 1));
    } else if (key.downArrow) {
      setScrollOffset(scrollOffset + 1);
    }
    // Filter by log level
    else if (input === '1') {
      setFilterLevel('debug');
    } else if (input === '2') {
      setFilterLevel('info');
    } else if (input === '3') {
      setFilterLevel('warn');
    } else if (input === '4') {
      setFilterLevel('error');
    } else if (input === '0') {
      setFilterLevel('all');
    }
  });

  // Filter logs
  const filteredLogs = filterLevel === 'all' 
    ? logs 
    : logs.filter(log => log.level === filterLevel);

  // Reverse to show newest first, then apply scrolling
  const visibleLogs = filteredLogs
    .slice()
    .reverse()
    .slice(scrollOffset, scrollOffset + 15); // Show 15 lines max

  const getLogColor = (level: LogLevel): string => {
    switch (level) {
      case 'error': return 'red';
      case 'warn': return 'yellow';
      case 'info': return 'blue';
      case 'debug': return 'gray';
      default: return 'white';
    }
  };

  const getLogIcon = (level: LogLevel): string => {
    switch (level) {
      case 'error': return '❌';
      case 'warn': return '⚠️';
      case 'info': return 'ℹ️';
      case 'debug': return '🔍';
      default: return '•';
    }
  };

  return (
    <Box borderStyle="single" paddingX={1} height="100%">
      <Box flexDirection="column" height="100%">
        <Box justifyContent="space-between" marginBottom={1}>
          <Text bold>📋 Logs</Text>
          <Text>
            <Text color="cyan">Filter: {filterLevel}</Text>
            <Text color="gray"> ({filteredLogs.length})</Text>
          </Text>
        </Box>

        {/* Filter Help */}
        <Box marginBottom={1}>
          <Text color="gray" dimColor>
            0:All 1:Debug 2:Info 3:Warn 4:Error | ↑↓:Scroll
          </Text>
        </Box>

        {/* Log Entries */}
        <Box flexDirection="column" height="80%">
          {visibleLogs.length === 0 ? (
            <Text color="gray">No logs to display</Text>
          ) : (
            visibleLogs.map((log, index) => {
              const timestamp = log.timestamp.toLocaleTimeString();
              const color = getLogColor(log.level);
              const icon = getLogIcon(log.level);

              return (
                <Box key={`${log.timestamp}-${index}`} marginBottom={0}>
                  <Box width="100%">
                    <Text color="gray">[{timestamp}]</Text>
                    <Text color={color}> {icon} {log.message}</Text>
                  </Box>
                  {log.context && (
                    <Box paddingLeft={2}>
                      <Text color="gray" dimColor>
                        {JSON.stringify(log.context, null, 0)}
                      </Text>
                    </Box>
                  )}
                </Box>
              );
            })
          )}
        </Box>

        {/* Scroll indicator */}
        {filteredLogs.length > 15 && (
          <Box marginTop={1}>
            <Text color="gray">
              Showing {Math.min(15, filteredLogs.length - scrollOffset)} of {filteredLogs.length}
              {scrollOffset > 0 && ` (offset: ${scrollOffset})`}
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
