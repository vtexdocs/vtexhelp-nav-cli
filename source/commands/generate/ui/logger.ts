import { createWriteStream, WriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { 
  LogLevel, 
  LogEntry, 
  GenerationStats, 
  PhaseSummary 
} from '../types.js';

export class DualLogger {
  private fileStream?: WriteStream;
  private stats: GenerationStats;
  private logs: LogEntry[] = [];
  private statsUpdateCallback?: (stats: GenerationStats) => void;
  private logUpdateCallback?: (entry: LogEntry) => void;
  
  constructor(
    private options: {
      logFile?: string;
      verbose: boolean;
      interactive: boolean;
    }
  ) {
    this.stats = {
      totalFiles: 0,
      processedFiles: 0,
      errors: 0,
      warnings: 0,
      currentPhase: 'Initializing',
      currentFile: '',
      languages: {},
      sections: {},
      startTime: new Date(),
      elapsedTime: '0s',
      memoryUsage: this.getMemoryUsage(),
    };
    
    this.initializeFileLogging();
  }

  private async initializeFileLogging() {
    if (this.options.logFile) {
      try {
        // Ensure directory exists
        const logDir = path.dirname(this.options.logFile);
        await fs.mkdir(logDir, { recursive: true });
        
        this.fileStream = createWriteStream(this.options.logFile, { flags: 'w' });
        this.log('info', 'Log file initialized', { file: this.options.logFile });
      } catch (error) {
        console.error('Failed to initialize log file:', error);
      }
    }
  }

  private getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
      used: Math.round(usage.heapUsed / 1024 / 1024), // MB
      total: Math.round(usage.heapTotal / 1024 / 1024), // MB
    };
  }

  private updateElapsedTime() {
    const elapsed = Date.now() - this.stats.startTime.getTime();
    const seconds = Math.floor(elapsed / 1000);
    
    if (seconds < 60) {
      this.stats.elapsedTime = `${seconds}s`;
    } else {
      const minutes = Math.floor(seconds / 60);
      this.stats.elapsedTime = `${minutes}m ${seconds % 60}s`;
    }
  }

  public setStatsUpdateCallback(callback: (stats: GenerationStats) => void) {
    this.statsUpdateCallback = callback;
  }

  public setLogUpdateCallback(callback: (entry: LogEntry) => void) {
    this.logUpdateCallback = callback;
  }

  public updateStats(updates: Partial<GenerationStats>) {
    Object.assign(this.stats, updates);
    this.updateElapsedTime();
    this.stats.memoryUsage = this.getMemoryUsage();
    
    if (this.statsUpdateCallback) {
      this.statsUpdateCallback({ ...this.stats });
    }
  }

  public log(level: LogLevel, message: string, context?: any) {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      context,
      phase: this.stats.currentPhase,
      file: this.stats.currentFile,
    };

    this.logs.push(entry);

    // Update error/warning counts
    if (level === 'error') {
      this.stats.errors++;
    } else if (level === 'warn') {
      this.stats.warnings++;
    }

    // Log to file if enabled
    if (this.fileStream) {
      this.fileStream.write(JSON.stringify(entry) + '\n');
    }

    // Notify UI callback
    if (this.logUpdateCallback) {
      this.logUpdateCallback(entry);
    }

    // Console fallback for non-interactive mode
    if (!this.options.interactive) {
      const timestamp = entry.timestamp.toISOString();
      const prefix = `[${timestamp}] ${level.toUpperCase()}:`;
      const contextStr = context ? ` ${JSON.stringify(context)}` : '';
      console.log(`${prefix} ${message}${contextStr}`);
    }
  }

  public startPhase(phase: string) {
    this.log('info', `Starting phase: ${phase}`);
    this.updateStats({ 
      currentPhase: phase,
      currentFile: '',
    });
  }

  public completePhase(phase: string, summary: PhaseSummary) {
    this.log('info', `Completed phase: ${phase}`, {
      duration: summary.duration,
      filesProcessed: summary.filesProcessed,
      errors: summary.errors.length,
      warnings: summary.warnings.length,
    });
    
    // Log errors and warnings
    summary.errors.forEach(error => this.log('error', error, { phase }));
    summary.warnings.forEach(warning => this.log('warn', warning, { phase }));
  }

  public setCurrentFile(filePath: string) {
    this.updateStats({ currentFile: filePath });
  }

  public incrementProcessed() {
    this.updateStats({ processedFiles: this.stats.processedFiles + 1 });
  }

  public updateLanguageStats(language: string, count: number) {
    this.updateStats({
      languages: {
        ...this.stats.languages,
        [language]: count,
      },
    });
  }

  public updateSectionStats(section: string, count: number) {
    this.updateStats({
      sections: {
        ...this.stats.sections,
        [section]: count,
      },
    });
  }

  public getStats(): GenerationStats {
    this.updateElapsedTime();
    this.stats.memoryUsage = this.getMemoryUsage();
    return { ...this.stats };
  }

  public getLogs(level?: LogLevel, phase?: string): LogEntry[] {
    let filteredLogs = this.logs;
    
    if (level) {
      filteredLogs = filteredLogs.filter(log => log.level === level);
    }
    
    if (phase) {
      filteredLogs = filteredLogs.filter(log => log.phase === phase);
    }
    
    return filteredLogs;
  }

  public async close() {
    if (this.fileStream) {
      this.fileStream.end();
      await new Promise<void>(resolve => this.fileStream!.on('close', () => resolve()));
    }
  }

  public debug(message: string, context?: any) {
    this.log('debug', message, context);
  }

  public info(message: string, context?: any) {
    this.log('info', message, context);
  }

  public warn(message: string, context?: any) {
    this.log('warn', message, context);
  }

  public error(message: string, context?: any) {
    this.log('error', message, context);
  }
}
