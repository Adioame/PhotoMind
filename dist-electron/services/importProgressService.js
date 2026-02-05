import { EventEmitter } from 'events';
export class ImportProgressService extends EventEmitter {
    constructor() {
        super();
        this.currentProgress = null;
        this.progressInterval = null;
        this.progressListeners = new Set();
        this.lastUpdateTime = 0;
    }
    subscribe(listener) {
        this.progressListeners.add(listener);
        return () => this.progressListeners.delete(listener);
    }
    notify() {
        if (!this.currentProgress)
            return;
        const now = Date.now();
        if (now - this.lastUpdateTime < 500 && this.currentProgress.stage !== 'complete') {
            return;
        }
        this.lastUpdateTime = now;
        for (const listener of this.progressListeners) {
            try {
                listener({ ...this.currentProgress });
            }
            catch (error) {
                console.error('[ImportProgress] 监听器错误:', error);
            }
        }
    }
    startSession(total, stage = 'preparing') {
        this.currentProgress = {
            stage,
            currentIndex: 0,
            total,
            imported: 0,
            skipped: 0,
            failed: 0,
            errors: [],
            startTime: Date.now()
        };
        this.startProgressTimer();
        this.notify();
    }
    startProgressTimer() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
        }
        this.progressInterval = setInterval(() => {
            this.updateEstimatedTime();
            this.notify();
        }, 1000);
    }
    setStage(stage) {
        if (this.currentProgress) {
            this.currentProgress.stage = stage;
            this.notify();
        }
    }
    updateCurrentFile(file) {
        if (this.currentProgress) {
            this.currentProgress.currentFile = file;
            this.notify();
        }
    }
    advanceProgress(imported = true, skipped = false, failed = false) {
        if (!this.currentProgress)
            return;
        this.currentProgress.currentIndex++;
        if (imported)
            this.currentProgress.imported++;
        if (skipped)
            this.currentProgress.skipped++;
        if (failed)
            this.currentProgress.failed++;
        this.updateEstimatedTime();
        this.notify();
    }
    addError(file, error) {
        if (this.currentProgress) {
            if (this.currentProgress.errors.length < 20) {
                this.currentProgress.errors.push({ file, error });
            }
            else if (this.currentProgress.errors.length === 20) {
                this.currentProgress.errors.push({ file, error: '更多错误已省略...' });
            }
            this.currentProgress.failed++;
            this.notify();
        }
    }
    updateEstimatedTime() {
        if (!this.currentProgress || this.currentProgress.currentIndex === 0) {
            return;
        }
        const elapsed = Date.now() - this.currentProgress.startTime;
        const avgTimePerFile = elapsed / this.currentProgress.currentIndex;
        const remaining = (this.currentProgress.total - this.currentProgress.currentIndex) * avgTimePerFile;
        this.currentProgress.estimatedTimeRemaining = Math.ceil(remaining / 1000);
    }
    setBytesProgress(bytesProcessed, totalBytes) {
        if (this.currentProgress) {
            this.currentProgress.bytesProcessed = bytesProcessed;
            this.currentProgress.totalBytes = totalBytes;
            this.notify();
        }
    }
    complete(success = true) {
        if (!this.currentProgress)
            return null;
        this.currentProgress.stage = success ? 'complete' : 'cancelled';
        this.currentProgress.estimatedTimeRemaining = 0;
        this.stop();
        const result = { ...this.currentProgress };
        this.notify();
        return result;
    }
    cancel() {
        if (this.currentProgress) {
            this.currentProgress.stage = 'cancelled';
            this.stop();
            this.notify();
        }
    }
    stop() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
    }
    getProgress() {
        return this.currentProgress ? { ...this.currentProgress } : null;
    }
    getPercentage() {
        if (!this.currentProgress || this.currentProgress.total === 0)
            return 0;
        return Math.round((this.currentProgress.currentIndex / this.currentProgress.total) * 100);
    }
    isActive() {
        return this.currentProgress !== null &&
            this.currentProgress.stage !== 'complete' &&
            this.currentProgress.stage !== 'cancelled';
    }
    static formatTime(seconds) {
        if (seconds < 60) {
            return `${seconds}秒`;
        }
        else if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${minutes}分${secs}秒`;
        }
        else {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return `${hours}小时${minutes}分`;
        }
    }
    static formatBytes(bytes) {
        if (bytes === 0)
            return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}
export const importProgressService = new ImportProgressService();
//# sourceMappingURL=importProgressService.js.map