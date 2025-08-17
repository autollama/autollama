/**
 * Animation Performance Monitor
 * Tracks FPS, frame drops, and animation bottlenecks for DocumentGrid
 */

export class AnimationPerformanceMonitor {
  constructor() {
    this.metrics = [];
    this.frameThreshold = 16.67; // 60fps target (1000ms / 60fps)
    this.isMonitoring = false;
    this.observer = null;
    this.rafId = null;
    
    // Performance thresholds
    this.thresholds = {
      fps: 50,           // Minimum acceptable FPS
      animationMs: 1000, // Maximum animation duration
      memoryMB: 100,     // Maximum memory increase
      jankFrames: 5,     // Maximum jank frames per second
    };
  }

  /**
   * Start monitoring animation performance
   */
  startMonitoring() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    console.log('🔍 Animation performance monitoring started');
    
    // Monitor long tasks that could cause jank
    if ('PerformanceObserver' in window) {
      this.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > this.frameThreshold) {
            this.recordJankFrame(entry.duration, entry.name);
          }
        }
      });
      
      try {
        this.observer.observe({ entryTypes: ['measure', 'navigation', 'resource'] });
      } catch (e) {
        console.warn('Performance observer not fully supported:', e);
      }
    }
    
    // Start FPS monitoring
    this.startFPSMonitoring();
  }

  /**
   * Stop monitoring and cleanup
   */
  stopMonitoring() {
    if (!this.isMonitoring) return;
    
    this.isMonitoring = false;
    
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    
    console.log('🔍 Animation performance monitoring stopped');
  }

  /**
   * Monitor FPS using requestAnimationFrame
   */
  startFPSMonitoring() {
    let lastTime = performance.now();
    let frameCount = 0;
    let jankFrames = 0;
    
    const measureFPS = (currentTime) => {
      if (!this.isMonitoring) return;
      
      const delta = currentTime - lastTime;
      frameCount++;
      
      // Check for frame drops (> 16.67ms for 60fps)
      if (delta > this.frameThreshold) {
        jankFrames++;
      }
      
      // Report every second
      if (frameCount >= 60) {
        const fps = Math.round(1000 / (delta / frameCount));
        
        this.recordFPSMetric({
          fps,
          jankFrames,
          timestamp: currentTime,
        });
        
        frameCount = 0;
        jankFrames = 0;
      }
      
      lastTime = currentTime;
      this.rafId = requestAnimationFrame(measureFPS);
    };
    
    this.rafId = requestAnimationFrame(measureFPS);
  }

  /**
   * Measure animation performance for a specific operation
   */
  measureAnimation(name, animationPromise) {
    const startTime = performance.now();
    const startMemory = this.getMemoryUsage();
    
    console.log(`🎬 Measuring animation: ${name}`);
    
    // Mark the start of measurement
    if (performance.mark) {
      performance.mark(`${name}-start`);
    }
    
    return animationPromise
      .then((result) => {
        const endTime = performance.now();
        const endMemory = this.getMemoryUsage();
        const duration = endTime - startTime;
        
        // Mark the end and measure
        if (performance.mark && performance.measure) {
          performance.mark(`${name}-end`);
          performance.measure(name, `${name}-start`, `${name}-end`);
        }
        
        const metrics = {
          name,
          duration,
          memoryDelta: endMemory - startMemory,
          timestamp: endTime,
          success: true,
        };
        
        this.recordAnimationMetric(metrics);
        return result;
      })
      .catch((error) => {
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        const metrics = {
          name,
          duration,
          timestamp: endTime,
          success: false,
          error: error.message,
        };
        
        this.recordAnimationMetric(metrics);
        throw error;
      });
  }

  /**
   * Record FPS metrics
   */
  recordFPSMetric(metric) {
    this.metrics.push({
      type: 'fps',
      ...metric,
    });
    
    // Warn if FPS is below threshold
    if (metric.fps < this.thresholds.fps) {
      console.warn(`⚠️ Low FPS detected: ${metric.fps} (target: ${this.thresholds.fps}+)`);
    }
    
    // Warn if too many jank frames
    if (metric.jankFrames > this.thresholds.jankFrames) {
      console.warn(`⚠️ High jank detected: ${metric.jankFrames} dropped frames`);
    }
    
    // Keep only recent metrics (last 100 entries)
    if (this.metrics.length > 100) {
      this.metrics = this.metrics.slice(-100);
    }
  }

  /**
   * Record animation-specific metrics
   */
  recordAnimationMetric(metric) {
    this.metrics.push({
      type: 'animation',
      ...metric,
    });
    
    // Warn if animation took too long
    if (metric.duration > this.thresholds.animationMs) {
      console.warn(`⚠️ Slow animation: ${metric.name} took ${Math.round(metric.duration)}ms`);
    }
    
    // Warn if memory usage increased significantly
    if (metric.memoryDelta > this.thresholds.memoryMB * 1024 * 1024) {
      console.warn(`⚠️ High memory usage: ${metric.name} increased by ${Math.round(metric.memoryDelta / 1024 / 1024)}MB`);
    }
    
    console.log(`✅ Animation completed: ${metric.name} (${Math.round(metric.duration)}ms)`);
  }

  /**
   * Record jank frame events
   */
  recordJankFrame(duration, taskName = 'unknown') {
    this.metrics.push({
      type: 'jank',
      duration,
      taskName,
      timestamp: performance.now(),
    });
    
    console.warn(`⚠️ Jank detected: ${taskName} took ${Math.round(duration)}ms`);
  }

  /**
   * Get current memory usage (if available)
   */
  getMemoryUsage() {
    if (window.performance && window.performance.memory) {
      return window.performance.memory.usedJSHeapSize;
    }
    return 0;
  }

  /**
   * Get performance summary
   */
  getSummary() {
    const animationMetrics = this.metrics.filter(m => m.type === 'animation' && m.success);
    const fpsMetrics = this.metrics.filter(m => m.type === 'fps');
    const jankMetrics = this.metrics.filter(m => m.type === 'jank');
    
    if (animationMetrics.length === 0 && fpsMetrics.length === 0) {
      return {
        status: 'no-data',
        message: 'No performance data available',
      };
    }
    
    const summary = {
      animations: {
        count: animationMetrics.length,
        avgDuration: animationMetrics.length > 0 
          ? Math.round(animationMetrics.reduce((sum, m) => sum + m.duration, 0) / animationMetrics.length)
          : 0,
        slowAnimations: animationMetrics.filter(m => m.duration > this.thresholds.animationMs).length,
      },
      fps: {
        measurements: fpsMetrics.length,
        avgFPS: fpsMetrics.length > 0
          ? Math.round(fpsMetrics.reduce((sum, m) => sum + m.fps, 0) / fpsMetrics.length)
          : 0,
        lowFPSEvents: fpsMetrics.filter(m => m.fps < this.thresholds.fps).length,
      },
      jank: {
        events: jankMetrics.length,
        totalJankTime: Math.round(jankMetrics.reduce((sum, m) => sum + m.duration, 0)),
      },
      status: this.getOverallStatus(animationMetrics, fpsMetrics, jankMetrics),
    };
    
    return summary;
  }

  /**
   * Get overall performance status
   */
  getOverallStatus(animationMetrics, fpsMetrics, jankMetrics) {
    const avgFPS = fpsMetrics.length > 0
      ? fpsMetrics.reduce((sum, m) => sum + m.fps, 0) / fpsMetrics.length
      : 60;
    
    const avgAnimationDuration = animationMetrics.length > 0
      ? animationMetrics.reduce((sum, m) => sum + m.duration, 0) / animationMetrics.length
      : 0;
    
    const jankCount = jankMetrics.length;
    
    if (avgFPS >= this.thresholds.fps && 
        avgAnimationDuration <= this.thresholds.animationMs && 
        jankCount <= this.thresholds.jankFrames) {
      return 'excellent';
    } else if (avgFPS >= this.thresholds.fps * 0.8) {
      return 'good';
    } else if (avgFPS >= this.thresholds.fps * 0.6) {
      return 'fair';
    } else {
      return 'poor';
    }
  }

  /**
   * Generate performance report
   */
  generateReport() {
    const summary = this.getSummary();
    
    console.group('📊 Animation Performance Report');
    console.log('Status:', summary.status);
    
    if (summary.animations.count > 0) {
      console.log('Animations:', summary.animations);
    }
    
    if (summary.fps.measurements > 0) {
      console.log('FPS:', summary.fps);
    }
    
    if (summary.jank.events > 0) {
      console.log('Jank Events:', summary.jank);
    }
    
    // Recommendations
    const recommendations = this.getRecommendations(summary);
    if (recommendations.length > 0) {
      console.log('Recommendations:', recommendations);
    }
    
    console.groupEnd();
    
    return summary;
  }

  /**
   * Get performance improvement recommendations
   */
  getRecommendations(summary) {
    const recommendations = [];
    
    if (summary.fps.avgFPS < this.thresholds.fps) {
      recommendations.push('Consider reducing animation complexity or duration');
    }
    
    if (summary.animations.slowAnimations > 0) {
      recommendations.push('Some animations exceed 1 second - consider breaking into smaller chunks');
    }
    
    if (summary.jank.events > 5) {
      recommendations.push('High jank detected - review animation timing and DOM updates');
    }
    
    if (summary.fps.lowFPSEvents > summary.fps.measurements * 0.2) {
      recommendations.push('Frequent FPS drops - consider debouncing animations or using requestIdleCallback');
    }
    
    return recommendations;
  }

  /**
   * Export metrics for external analysis
   */
  exportMetrics() {
    return {
      metrics: [...this.metrics],
      summary: this.getSummary(),
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
    };
  }
}

// Singleton instance for global use
export const performanceMonitor = new AnimationPerformanceMonitor();

// Development helper functions
export const startPerformanceMonitoring = () => {
  if (process.env.NODE_ENV === 'development') {
    performanceMonitor.startMonitoring();
  }
};

export const stopPerformanceMonitoring = () => {
  performanceMonitor.stopMonitoring();
};

export const measureAnimationPerformance = (name, animationPromise) => {
  if (process.env.NODE_ENV === 'development') {
    return performanceMonitor.measureAnimation(name, animationPromise);
  }
  return animationPromise;
};

export const getPerformanceReport = () => {
  return performanceMonitor.generateReport();
};

export default AnimationPerformanceMonitor;