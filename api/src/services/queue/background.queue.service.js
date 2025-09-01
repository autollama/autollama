/**
 * Background Job Queue Service
 * Handles asynchronous processing jobs independent of HTTP connections
 * Supports parallel processing and persistent job state
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const { logPerformanceMetric, logError } = require('../../utils/logger');
const { JOB_STATUS, JOB_TYPES, DEFAULTS } = require('../../utils/constants');
const StreamingProcessor = require('../processing/streaming.processor');

class BackgroundQueueService extends EventEmitter {
  constructor(dependencies) {
    super();
    
    this.db = dependencies.database || dependencies.databaseService;
    this.contentProcessor = dependencies.contentProcessor;
    this.sseService = dependencies.sseService;
    
    // Initialize streaming processor for large files
    this.streamingProcessor = new StreamingProcessor({
      contentProcessor: dependencies.contentProcessor,
      fileProcessor: dependencies.fileProcessor,
      storageService: dependencies.storageService,
      database: this.db,
      databaseService: dependencies.databaseService,
      sseService: dependencies.sseService,
      backgroundQueue: this
    });
    
    this.config = {
      maxConcurrentJobs: dependencies.config?.queue?.maxConcurrentJobs || 3,
      maxRetries: dependencies.config?.queue?.maxRetries || 3,
      retryDelay: dependencies.config?.queue?.retryDelay || 30000, // 30 seconds
      jobTimeout: dependencies.config?.queue?.jobTimeout || 7200000, // 120 minutes (2 hours)
      cleanupInterval: dependencies.config?.queue?.cleanupInterval || 180000, // 3 minutes
      heartbeatInterval: dependencies.config?.queue?.heartbeatInterval || 30000, // 30 seconds
      heartbeatTimeout: dependencies.config?.queue?.heartbeatTimeout || 300000, // 5 minutes
      progressTimeout: dependencies.config?.queue?.progressTimeout || 600000 // 10 minutes max without progress
    };
    
    this.logger = require('../../utils/logger').createChildLogger({ component: 'background-queue' });
    
    // Job tracking
    this.activeJobs = new Map(); // jobId -> { worker, startTime, heartbeat }
    this.jobQueue = []; // Pending jobs
    this.isProcessing = false;
    
    // Statistics
    this.stats = {
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      activeJobs: 0,
      queuedJobs: 0
    };
    
    this.logger.info('Background Queue Service initialized', {
      maxConcurrentJobs: this.config.maxConcurrentJobs,
      jobTimeout: `${this.config.jobTimeout / 1000}s`,
      maxRetries: this.config.maxRetries
    });
  }

  /**
   * Serialize file data for database storage, handling Buffer objects
   * @param {Object} fileData - File data object with potential Buffer
   * @returns {string} JSON string with Buffer converted to base64
   */
  _serializeFileData(fileData) {
    if (!fileData) return null;
    
    const serializable = { ...fileData };
    
    // Convert Buffer to base64 string for JSON serialization
    if (Buffer.isBuffer(fileData.buffer)) {
      serializable.buffer = {
        type: 'Buffer',
        data: fileData.buffer.toString('base64')
      };
    }
    
    return JSON.stringify(serializable);
  }
  
  /**
   * Deserialize file data from database storage, reconstructing Buffer objects
   * @param {string} fileDataJson - JSON string from database
   * @returns {Object} File data object with Buffer reconstructed
   */
  _deserializeFileData(fileDataJson) {
    if (!fileDataJson) return null;
    
    const fileData = JSON.parse(fileDataJson);
    
    // Reconstruct Buffer from base64 string
    if (fileData.buffer && fileData.buffer.type === 'Buffer' && fileData.buffer.data) {
      fileData.buffer = Buffer.from(fileData.buffer.data, 'base64');
    }
    
    return fileData;
  }

  /**
   * Start the background queue processing
   */
  async start() {
    if (this.isProcessing) {
      this.logger.warn('Queue already running');
      return;
    }
    
    this.isProcessing = true;
    this.logger.info('Starting background queue service');
    
    // Start job processor
    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, 1000);
    
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleJobs();
    }, this.config.cleanupInterval);
    
    // Recover any interrupted jobs from database
    await this.recoverInterruptedJobs();
    
    this.logger.info('Background queue service started');
  }

  /**
   * Stop the background queue processing
   */
  async stop() {
    if (!this.isProcessing) {
      return;
    }
    
    this.isProcessing = false;
    this.logger.info('Stopping background queue service');
    
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    // Wait for active jobs to complete (with timeout)
    const timeout = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (this.activeJobs.size > 0 && (Date.now() - startTime) < timeout) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    this.logger.info('Background queue service stopped', {
      remainingActiveJobs: this.activeJobs.size
    });
  }

  /**
   * Add a URL processing job to the queue
   * @param {string} url - URL to process
   * @param {Object} options - Processing options
   * @returns {string} Job ID
   */
  async addURLJob(url, options = {}) {
    const jobId = uuidv4();
    const sessionId = options.sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const job = {
      id: jobId,
      sessionId,
      type: JOB_TYPES.URL_PROCESSING,
      url,
      options: {
        chunkSize: options.chunkSize || 1000,
        overlap: options.overlap || 100,
        enableContextualEmbeddings: options.enableContextualEmbeddings !== false,
        ...options
      },
      status: JOB_STATUS.QUEUED,
      createdAt: new Date(),
      updatedAt: new Date(),
      retries: 0,
      priority: options.priority || 5
    };
    
    // Store job in database for persistence
    await this.storeJob(job);
    
    // Add to in-memory queue
    this.jobQueue.push(job);
    this.jobQueue.sort((a, b) => a.priority - b.priority);
    
    this.stats.totalJobs++;
    this.stats.queuedJobs++;
    
    this.logger.info('URL processing job queued', {
      jobId,
      sessionId,
      url: url.substring(0, 100),
      queuePosition: this.jobQueue.length
    });
    
    // Emit event for SSE updates
    this.emit('jobQueued', { jobId, sessionId, url, queuePosition: this.jobQueue.length });
    
    return { jobId, sessionId };
  }

  /**
   * Add a file processing job to the queue
   * @param {Object} fileData - File information
   * @param {Object} options - Processing options
   * @returns {string} Job ID
   */
  async addFileJob(fileData, options = {}) {
    const jobId = uuidv4();
    const sessionId = options.sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const job = {
      id: jobId,
      sessionId,
      type: JOB_TYPES.FILE_PROCESSING,
      fileData,
      options: {
        chunkSize: options.chunkSize || 1000,
        overlap: options.overlap || 100,
        enableContextualEmbeddings: options.enableContextualEmbeddings !== false,
        ...options
      },
      status: JOB_STATUS.QUEUED,
      createdAt: new Date(),
      updatedAt: new Date(),
      retries: 0,
      priority: options.priority || 5
    };
    
    // Store job in database for persistence
    await this.storeJob(job);
    
    // Create document record immediately for UI display
    let documentRecord = null;
    try {
      // Extract title from filename
      const title = fileData.originalname?.replace(/\.[^/.]+$/, "") || "Processing File...";
      
      // Create document record with processing status
      const query = `
        INSERT INTO processed_content (
          url, title, summary, chunk_text, chunk_id, chunk_index,
          upload_source, record_type, created_time, processed_date, updated_at,
          processing_status, embedding_status, uses_contextual_embedding
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), NOW(), $9, $10, $11
        ) RETURNING *
      `;
      
      const fileUrl = `file://${fileData.originalname}`;
      const values = [
        fileUrl, // url
        title, // title
        `Processing ${fileData.originalname} (${Math.round(fileData.size/1024)}KB)...`, // summary
        null, // chunk_text (null for document records)
        `doc_${jobId}`, // chunk_id
        -1, // chunk_index (-1 indicates document record)
        'user', // upload_source
        'document', // record_type
        'processing', // processing_status
        'pending', // embedding_status
        true // uses_contextual_embedding
      ];
      
      const result = await this.db.query(query, values);
      documentRecord = result.rows[0];
      
      this.logger.info('Created document record for queued file', {
        documentId: documentRecord.id,
        title,
        fileName: fileData.originalname,
        jobId,
        sessionId
      });
      
    } catch (error) {
      this.logger.warn('Failed to create document record for queued file', {
        error: error.message,
        fileName: fileData.originalname,
        jobId,
        sessionId
      });
    }
    
    // Add to in-memory queue
    this.jobQueue.push(job);
    this.jobQueue.sort((a, b) => a.priority - b.priority);
    
    this.stats.totalJobs++;
    this.stats.queuedJobs++;
    
    this.logger.info('File processing job queued', {
      jobId,
      sessionId,
      fileName: fileData.originalname,
      fileSize: fileData.size,
      queuePosition: this.jobQueue.length,
      documentCreated: !!documentRecord
    });
    
    // Emit event for SSE updates
    this.emit('jobQueued', { 
      jobId, 
      sessionId, 
      fileName: fileData.originalname, 
      queuePosition: this.jobQueue.length,
      documentRecord
    });
    
    return { jobId, sessionId, documentRecord };
  }

  /**
   * Process the job queue
   */
  async processQueue() {
    if (!this.isProcessing) {
      return;
    }
    
    // Check if we can start new jobs
    const availableSlots = this.config.maxConcurrentJobs - this.activeJobs.size;
    if (availableSlots <= 0 || this.jobQueue.length === 0) {
      return;
    }
    
    // Start as many jobs as we have slots for
    const jobsToStart = Math.min(availableSlots, this.jobQueue.length);
    
    for (let i = 0; i < jobsToStart; i++) {
      const job = this.jobQueue.shift();
      if (job) {
        this.stats.queuedJobs--;
        this.startJob(job);
      }
    }
  }

  /**
   * Start processing a job
   * @param {Object} job - Job to process
   */
  async startJob(job) {
    this.logger.info('Starting job processing', {
      jobId: job.id,
      sessionId: job.sessionId,
      type: job.type
    });
    
    // Update job status in database
    job.status = JOB_STATUS.PROCESSING;
    job.updatedAt = new Date();
    job.startedAt = new Date();
    await this.updateJob(job);
    
    // Track active job with enhanced monitoring
    this.activeJobs.set(job.id, {
      job,
      startTime: Date.now(),
      lastHeartbeat: Date.now(),
      lastProgressUpdate: Date.now(),
      progressUpdates: 0,
      chunksProcessed: 0
    });
    
    this.stats.activeJobs++;
    
    // Emit event for SSE updates
    this.emit('jobStarted', { 
      jobId: job.id, 
      sessionId: job.sessionId, 
      type: job.type 
    });
    
    // Start automatic heartbeat for long-running jobs
    const heartbeatTimer = setInterval(() => {
      const activeJob = this.activeJobs.get(job.id);
      if (activeJob) {
        activeJob.lastHeartbeat = Date.now();
        this.logger.debug('Automatic heartbeat update', {
          jobId: job.id,
          sessionId: job.sessionId,
          runtime: `${Date.now() - activeJob.startTime}ms`
        });
      } else {
        clearInterval(heartbeatTimer);
      }
    }, this.config.heartbeatInterval);
    
    // Store timer reference for cleanup
    this.activeJobs.get(job.id).heartbeatTimer = heartbeatTimer;
    
    // Start processing in background (don't await)
    this.executeJob(job).catch(error => {
      this.logger.error('Job execution failed', {
        jobId: job.id,
        error: error.message,
        stack: error.stack
      });
    }).finally(() => {
      // Clean up heartbeat timer
      clearInterval(heartbeatTimer);
    });
  }

  /**
   * Execute a job
   * @param {Object} job - Job to execute
   */
  async executeJob(job) {
    const startTime = Date.now();
    
    try {
      let result;
      
      // Create enhanced progress callback for ContentProcessor
      const progressCallback = (event, data) => {
        const now = Date.now();
        const activeJob = this.activeJobs.get(job.id);
        
        if (activeJob) {
          // Update heartbeat and progress tracking
          activeJob.lastHeartbeat = now;
          activeJob.lastProgressUpdate = now;
          activeJob.progressUpdates++;
          
          // Track chunks processed for better monitoring
          if (data && typeof data.processedChunks === 'number') {
            activeJob.chunksProcessed = data.processedChunks;
          }
          
          // Log progress periodically for debugging
          if (activeJob.progressUpdates % 10 === 0) {
            this.logger.debug('Job progress update', {
              jobId: job.id,
              sessionId: job.sessionId,
              event,
              progressUpdates: activeJob.progressUpdates,
              chunksProcessed: activeJob.chunksProcessed,
              runtime: `${now - activeJob.startTime}ms`
            });
          }
        }
        
        // Broadcast progress via SSE
        if (this.sseService) {
          this.sseService.broadcast('processing_progress', {
            jobId: job.id,
            sessionId: job.sessionId,
            event,
            data,
            timestamp: new Date().toISOString()
          });
        }
        
        // Emit progress event
        this.emit('jobProgress', {
          jobId: job.id,
          sessionId: job.sessionId,
          event,
          data,
          progressUpdates: activeJob?.progressUpdates || 0
        });
      };
      
      // Execute based on job type
      if (job.type === JOB_TYPES.URL_PROCESSING) {
        result = await this.contentProcessor.processURLContent(job.url, {
          ...job.options,
          sessionId: job.sessionId,
          sseCallback: progressCallback
        });
      } else if (job.type === JOB_TYPES.FILE_PROCESSING) {
        // Check if file should use streaming processing
        const fileSize = job.fileData.size || (job.fileData.buffer ? job.fileData.buffer.length : 0);
        
        this.logger.info('🔍 Checking streaming processor eligibility', {
          jobId: job.id,
          filename: job.fileData.originalname,
          fileSize,
          fileSizeKB: Math.round(fileSize / 1024),
          mimeType: job.fileData.mimetype,
          isEPUB: job.fileData.mimetype === 'application/epub+zip',
          meetsEPUBThreshold: fileSize > 300 * 1024
        });
        
        const shouldUseStreaming = this._shouldUseStreamingProcessing(job.fileData, fileSize);
        
        this.logger.info('🎯 Streaming processor decision', {
          jobId: job.id,
          shouldUseStreaming,
          filename: job.fileData.originalname,
          decision: shouldUseStreaming ? 'USING_STREAMING' : 'USING_REGULAR'
        });
        
        if (shouldUseStreaming) {
          this.logger.info('✨ Using streaming processing for large file', {
            jobId: job.id,
            filename: job.fileData.originalname,
            fileSize,
            mimeType: job.fileData.mimetype
          });
          
          result = await this.streamingProcessor.processFileStreaming(
            job.fileData.buffer,
            job.fileData.originalname,
            job.fileData.mimetype,
            {
              ...job.options,
              sessionId: job.sessionId,
              sseCallback: progressCallback
            }
          );
        } else {
          // Use regular processing for smaller files
          result = await this.contentProcessor.processFileContent(
            job.fileData.buffer || job.fileData.path,
            job.fileData.mimetype,
            job.fileData.originalname,
            {
              ...job.options,
              sessionId: job.sessionId,
              sseCallback: progressCallback
            }
          );
        }
      } else {
        throw new Error(`Unknown job type: ${job.type}`);
      }
      
      // Job completed successfully
      await this.completeJob(job, result, Date.now() - startTime);
      
    } catch (error) {
      // Job failed
      await this.failJob(job, error, Date.now() - startTime);
    }
  }

  /**
   * Mark job as completed
   * @param {Object} job - Completed job
   * @param {Object} result - Processing result
   * @param {number} duration - Processing duration in ms
   */
  async completeJob(job, result, duration) {
    this.logger.info('Job completed successfully', {
      jobId: job.id,
      sessionId: job.sessionId,
      duration: `${duration}ms`,
      documentsProcessed: result.documentsProcessed || 1,
      chunksCreated: result.chunksCreated || 0
    });
    
    // Update job in database
    job.status = JOB_STATUS.COMPLETED;
    job.completedAt = new Date();
    job.updatedAt = new Date();
    job.result = result;
    job.duration = duration;
    await this.updateJob(job);
    
    // Update document record with completion status
    if (job.type === JOB_TYPES.FILE_PROCESSING) {
      try {
        const fileUrl = `file://${job.fileData.originalname}`;
        const chunksCreated = result.totalChunks || result.processedChunks || 0;
        
        await this.db.query(`
          UPDATE processed_content 
          SET processing_status = 'completed',
              embedding_status = 'completed',
              summary = $1,
              updated_at = NOW()
          WHERE url = $2 AND record_type = 'document'
        `, [
          `Processing completed. Created ${chunksCreated} chunks with contextual embeddings.`,
          fileUrl
        ]);
        
        this.logger.info('Updated document record on job completion', {
          jobId: job.id,
          fileName: job.fileData.originalname,
          chunksCreated
        });
        
      } catch (error) {
        this.logger.warn('Failed to update document record on completion', {
          jobId: job.id,
          error: error.message
        });
      }
    }
    
    // Clean up heartbeat timer and remove from active jobs
    const activeJob = this.activeJobs.get(job.id);
    if (activeJob && activeJob.heartbeatTimer) {
      clearInterval(activeJob.heartbeatTimer);
    }
    this.activeJobs.delete(job.id);
    this.stats.activeJobs--;
    this.stats.completedJobs++;
    
    // Emit completion event
    this.emit('jobCompleted', {
      jobId: job.id,
      sessionId: job.sessionId,
      result,
      duration
    });
    
    // Broadcast completion via SSE
    if (this.sseService) {
      this.sseService.broadcast('processing_completed', {
        jobId: job.id,
        sessionId: job.sessionId,
        result,
        duration,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Mark job as failed
   * @param {Object} job - Failed job
   * @param {Error} error - Error that caused failure
   * @param {number} duration - Processing duration in ms
   */
  async failJob(job, error, duration) {
    job.retries++;
    
    this.logger.error('Job failed', {
      jobId: job.id,
      sessionId: job.sessionId,
      error: error.message,
      retries: job.retries,
      maxRetries: this.config.maxRetries,
      duration: `${duration}ms`
    });
    
    // Check if we should retry
    if (job.retries < this.config.maxRetries) {
      // Schedule retry
      job.status = JOB_STATUS.QUEUED;
      job.updatedAt = new Date();
      job.nextRetryAt = new Date(Date.now() + this.config.retryDelay);
      await this.updateJob(job);
      
      // Clean up heartbeat timer, remove from active jobs and add back to queue
      const activeJob = this.activeJobs.get(job.id);
      if (activeJob && activeJob.heartbeatTimer) {
        clearInterval(activeJob.heartbeatTimer);
      }
      this.activeJobs.delete(job.id);
      this.stats.activeJobs--;
      
      setTimeout(() => {
        this.jobQueue.push(job);
        this.jobQueue.sort((a, b) => a.priority - b.priority);
        this.stats.queuedJobs++;
      }, this.config.retryDelay);
      
      this.logger.info('Job scheduled for retry', {
        jobId: job.id,
        retryAttempt: job.retries,
        nextRetryAt: job.nextRetryAt
      });
      
    } else {
      // Job permanently failed
      job.status = JOB_STATUS.FAILED;
      job.failedAt = new Date();
      job.updatedAt = new Date();
      job.error = {
        message: error.message,
        stack: error.stack,
        duration
      };
      await this.updateJob(job);
      
      // Update document record with failure status
      if (job.type === JOB_TYPES.FILE_PROCESSING) {
        try {
          const fileUrl = `file://${job.fileData.originalname}`;
          
          await this.db.query(`
            UPDATE processed_content 
            SET processing_status = 'failed',
                embedding_status = 'failed',
                summary = $1,
                updated_at = NOW()
            WHERE url = $2 AND record_type = 'document'
          `, [
            `Processing failed: ${error.message}`,
            fileUrl
          ]);
          
          this.logger.info('Updated document record on job failure', {
            jobId: job.id,
            fileName: job.fileData.originalname,
            error: error.message
          });
          
        } catch (updateError) {
          this.logger.warn('Failed to update document record on failure', {
            jobId: job.id,
            error: updateError.message
          });
        }
      }
      
      // Clean up heartbeat timer and remove from active jobs
      const activeJob = this.activeJobs.get(job.id);
      if (activeJob && activeJob.heartbeatTimer) {
        clearInterval(activeJob.heartbeatTimer);
      }
      this.activeJobs.delete(job.id);
      this.stats.activeJobs--;
      this.stats.failedJobs++;
      
      // Emit failure event
      this.emit('jobFailed', {
        jobId: job.id,
        sessionId: job.sessionId,
        error: error.message,
        retries: job.retries
      });
      
      // Broadcast failure via SSE
      if (this.sseService) {
        this.sseService.broadcast('processing_failed', {
          jobId: job.id,
          sessionId: job.sessionId,
          error: error.message,
          retries: job.retries,
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  /**
   * Cleanup stale jobs (stuck or timed out)
   */
  async cleanupStaleJobs() {
    const now = Date.now();
    const timeout = this.config.jobTimeout;
    
    for (const [jobId, activeJob] of this.activeJobs.entries()) {
      const jobAge = now - activeJob.startTime;
      const heartbeatAge = now - activeJob.lastHeartbeat;
      
      // Check for timeout
      if (jobAge > timeout) {
        this.logger.warn('Job timed out', {
          jobId,
          sessionId: activeJob.job.sessionId,
          duration: `${jobAge}ms`,
          timeout: `${timeout}ms`
        });
        
        await this.failJob(
          activeJob.job,
          new Error(`Job timed out after ${timeout}ms`),
          jobAge
        );
      }
      
      // Check for stale heartbeat (using configurable timeout)
      else if (heartbeatAge > this.config.heartbeatTimeout) {
        this.logger.warn('Job heartbeat timeout', {
          jobId,
          sessionId: activeJob.job.sessionId,
          lastHeartbeat: `${heartbeatAge}ms ago`,
          heartbeatTimeout: `${this.config.heartbeatTimeout}ms`
        });
        
        await this.failJob(
          activeJob.job,
          new Error(`Job heartbeat timeout after ${heartbeatAge}ms (limit: ${this.config.heartbeatTimeout}ms)`),
          jobAge
        );
      }
      
      // Check for progress timeout (no progress updates)
      else if (activeJob.lastProgressUpdate && (now - activeJob.lastProgressUpdate) > this.config.progressTimeout) {
        this.logger.warn('Job progress timeout', {
          jobId,
          sessionId: activeJob.job.sessionId,
          lastProgress: `${now - activeJob.lastProgressUpdate}ms ago`,
          progressTimeout: `${this.config.progressTimeout}ms`
        });
        
        await this.failJob(
          activeJob.job,
          new Error(`Job progress timeout after ${now - activeJob.lastProgressUpdate}ms (no progress updates)`),
          jobAge
        );
      }
    }
  }

  /**
   * Recover interrupted jobs from database
   */
  async recoverInterruptedJobs() {
    try {
      this.logger.info('Skipping job recovery to prevent startup hang');
      return; // TEMPORARY FIX: Skip job recovery to allow API to start
      
      for (const jobData of result.rows) {
        const job = {
          id: jobData.id,
          sessionId: jobData.session_id,
          type: jobData.type,
          url: jobData.url,
          fileData: this._deserializeFileData(jobData.file_data),
          options: typeof jobData.options === 'string' ? JSON.parse(jobData.options) : (jobData.options || {}),
          status: JOB_STATUS.QUEUED, // Reset to queued
          createdAt: jobData.created_at,
          updatedAt: new Date(),
          retries: jobData.retries || 0,
          priority: jobData.priority || 5
        };
        
        // Add back to queue
        this.jobQueue.push(job);
        this.stats.queuedJobs++;
        this.stats.totalJobs++; // Don't double count, but ensure consistency
      }
      
      this.jobQueue.sort((a, b) => a.priority - b.priority);
      
      this.logger.info('Job recovery completed', {
        recoveredJobs: result.rows.length,
        queuedJobs: this.stats.queuedJobs
      });
      
    } catch (error) {
      this.logger.error('Failed to recover interrupted jobs', {
        error: error.message
      });
    }
  }

  /**
   * Store job in database
   * @param {Object} job - Job to store
   */
  async storeJob(job) {
    try {
      await this.db.query(`
        INSERT INTO background_jobs (
          id, session_id, type, url, file_data, options, status, 
          created_at, updated_at, retries, priority
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE SET
          status = $7,
          updated_at = $9,
          retries = $10
      `, [
        job.id,
        job.sessionId,
        job.type,
        job.url || null,
        this._serializeFileData(job.fileData),
        JSON.stringify(job.options),
        job.status,
        job.createdAt,
        job.updatedAt,
        job.retries,
        job.priority
      ]);
    } catch (error) {
      this.logger.error('Failed to store job in database', {
        jobId: job.id,
        error: error.message
      });
    }
  }

  /**
   * Update job in database
   * @param {Object} job - Job to update
   */
  async updateJob(job) {
    try {
      await this.db.query(`
        UPDATE background_jobs SET
          status = $2,
          updated_at = $3,
          started_at = $4,
          completed_at = $5,
          failed_at = $6,
          retries = $7,
          result = $8,
          error = $9,
          duration = $10,
          next_retry_at = $11
        WHERE id = $1
      `, [
        job.id,
        job.status,
        job.updatedAt,
        job.startedAt || null,
        job.completedAt || null,
        job.failedAt || null,
        job.retries,
        job.result ? JSON.stringify(job.result) : null,
        job.error ? JSON.stringify(job.error) : null,
        job.duration || null,
        job.nextRetryAt || null
      ]);
    } catch (error) {
      this.logger.error('Failed to update job in database', {
        jobId: job.id,
        error: error.message
      });
    }
  }

  /**  
   * Get job status
   * @param {string} jobId - Job ID
   * @returns {Object} Job status
   */
  async getJobStatus(jobId) {
    try {
      const result = await this.db.query(
        'SELECT * FROM background_jobs WHERE id = $1',
        [jobId]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const job = result.rows[0];
      const isActive = this.activeJobs.has(jobId);
      
      return {
        id: job.id,
        sessionId: job.session_id,
        type: job.type,
        status: job.status,
        createdAt: job.created_at,
        updatedAt: job.updated_at,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        failedAt: job.failed_at,
        retries: job.retries,
        duration: job.duration,
        isActive,
        progress: isActive ? this.activeJobs.get(jobId)?.progress : null,
        result: job.result ? this._safeJSONParse(job.result) : null,
        error: job.error ? this._safeJSONParse(job.error) : null
      };
      
    } catch (error) {
      this.logger.error('Failed to get job status', {
        jobId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Get queue statistics
   * @returns {Object} Queue stats
   */
  getStats() {
    return {
      ...this.stats,
      activeJobs: this.activeJobs.size,
      queuedJobs: this.jobQueue.length,
      config: {
        maxConcurrentJobs: this.config.maxConcurrentJobs,
        maxRetries: this.config.maxRetries,
        jobTimeout: this.config.jobTimeout
      }
    };
  }

  /**
   * Cancel all jobs for a specific session
   * @param {string} sessionId - Session ID to cancel jobs for
   * @returns {Object} Results with cancelled job counts
   */
  async cancelJobsBySession(sessionId) {
    try {
      let cancelledJobs = 0;
      let failedCancellations = 0;
      const cancelledJobIds = [];

      // Cancel jobs from the queue
      for (let i = this.jobQueue.length - 1; i >= 0; i--) {
        const job = this.jobQueue[i];
        if (job.sessionId === sessionId) {
          const removedJob = this.jobQueue.splice(i, 1)[0];
          removedJob.status = JOB_STATUS.CANCELLED;
          removedJob.updatedAt = new Date();
          
          try {
            await this.updateJob(removedJob);
            cancelledJobs++;
            cancelledJobIds.push(removedJob.id);
            this.stats.queuedJobs--;
            this.logger.info('Queued job cancelled for session', { 
              jobId: removedJob.id, 
              sessionId 
            });
          } catch (error) {
            failedCancellations++;
            this.logger.error('Failed to cancel queued job', { 
              jobId: removedJob.id, 
              sessionId, 
              error: error.message 
            });
          }
        }
      }

      // Cancel active jobs
      for (const [jobId, activeJob] of this.activeJobs) {
        if (activeJob.job.sessionId === sessionId) {
          try {
            activeJob.job.status = JOB_STATUS.CANCELLED;
            activeJob.job.updatedAt = new Date();
            await this.updateJob(activeJob.job);
            
            // Remove from active jobs
            this.activeJobs.delete(jobId);
            this.stats.activeJobs--;
            
            cancelledJobs++;
            cancelledJobIds.push(jobId);
            this.logger.info('Active job cancelled for session', { 
              jobId, 
              sessionId 
            });

            // Emit cancellation event
            this.emit('jobCancelled', {
              jobId,
              sessionId,
              reason: 'session_stopped'
            });

          } catch (error) {
            failedCancellations++;
            this.logger.error('Failed to cancel active job', { 
              jobId, 
              sessionId, 
              error: error.message 
            });
          }
        }
      }

      // Update database for any remaining jobs
      try {
        const dbResult = await this.db.query(`
          UPDATE background_jobs 
          SET status = $1, updated_at = NOW() 
          WHERE session_id = $2 AND status IN ('pending', 'processing')
          RETURNING id
        `, [JOB_STATUS.CANCELLED, sessionId]);

        const dbCancelledCount = dbResult.rows.length;
        const dbCancelledIds = dbResult.rows.map(row => row.id);
        
        this.logger.info('Database jobs cancelled for session', { 
          sessionId, 
          count: dbCancelledCount,
          jobIds: dbCancelledIds
        });

        // Add DB-only cancellations to our totals (avoid double counting)
        const newCancellations = dbCancelledIds.filter(id => !cancelledJobIds.includes(id));
        cancelledJobs += newCancellations.length;
        cancelledJobIds.push(...newCancellations);

      } catch (error) {
        this.logger.error('Failed to cancel database jobs for session', { 
          sessionId, 
          error: error.message 
        });
        failedCancellations++;
      }

      const result = {
        success: cancelledJobs > 0 || failedCancellations === 0,
        sessionId,
        cancelledJobs,
        failedCancellations,
        cancelledJobIds,
        message: `Cancelled ${cancelledJobs} job(s) for session ${sessionId}`
      };

      this.logger.info('Session job cancellation completed', result);
      return result;

    } catch (error) {
      this.logger.error('Error cancelling jobs for session', { 
        sessionId, 
        error: error.message 
      });
      return {
        success: false,
        sessionId,
        cancelledJobs: 0,
        failedCancellations: 1,
        cancelledJobIds: [],
        error: error.message,
        message: `Failed to cancel jobs for session ${sessionId}: ${error.message}`
      };
    }
  }

  /**
   * Cancel a job
   * @param {string} jobId - Job ID to cancel
   * @returns {boolean} Success
   */
  async cancelJob(jobId) {
    try {
      // Remove from queue if queued
      const queueIndex = this.jobQueue.findIndex(job => job.id === jobId);
      if (queueIndex !== -1) {
        const job = this.jobQueue.splice(queueIndex, 1)[0];
        job.status = JOB_STATUS.CANCELLED;
        job.updatedAt = new Date();
        await this.updateJob(job);
        this.stats.queuedJobs--;
        
        this.logger.info('Job cancelled from queue', { jobId });
        return true;
      }
      
      // Cancel active job
      const activeJob = this.activeJobs.get(jobId);
      if (activeJob) {
        activeJob.job.status = JOB_STATUS.CANCELLED;
        activeJob.job.updatedAt = new Date();
        await this.updateJob(activeJob.job);
        
        // Clean up heartbeat timer
        const activeJobData = this.activeJobs.get(jobId);
        if (activeJobData && activeJobData.heartbeatTimer) {
          clearInterval(activeJobData.heartbeatTimer);
        }
        this.activeJobs.delete(jobId);
        this.stats.activeJobs--;
        
        this.logger.info('Active job cancelled', { jobId });
        return true;
      }
      
      // Update database for completed/failed jobs
      await this.db.query(
        'UPDATE background_jobs SET status = $1, updated_at = $2 WHERE id = $3',
        [JOB_STATUS.CANCELLED, new Date(), jobId]
      );
      
      return true;
      
    } catch (error) {
      this.logger.error('Failed to cancel job', {
        jobId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Determine if file should use streaming processing
   * @private
   */
  _shouldUseStreamingProcessing(fileData, fileSize) {
    // File size threshold (500KB+)
    const MIN_STREAMING_SIZE = 500 * 1024;
    
    this.logger.info('📊 Streaming processor evaluation', {
      filename: fileData.originalname,
      mimeType: fileData.mimetype,
      fileSize,
      fileSizeKB: Math.round(fileSize / 1024),
      minStreamingSizeKB: Math.round(MIN_STREAMING_SIZE / 1024)
    });
    
    if (fileSize < MIN_STREAMING_SIZE) {
      this.logger.info('❌ File too small for general streaming', {
        fileSize,
        minRequired: MIN_STREAMING_SIZE,
        checkingSpecificTypes: true
      });
      // Don't return false immediately - check specific file types
    }

    // File types that benefit from streaming
    const STREAMABLE_TYPES = ['application/epub+zip', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    
    if (!STREAMABLE_TYPES.includes(fileData.mimetype)) {
      this.logger.info('❌ File type not streamable', {
        mimeType: fileData.mimetype,
        supportedTypes: STREAMABLE_TYPES
      });
      return false;
    }

    // For EPUB specifically, always use streaming for files over 300KB
    if (fileData.mimetype === 'application/epub+zip') {
      const epubThreshold = 300 * 1024;
      const shouldStream = fileSize > epubThreshold;
      this.logger.info(shouldStream ? '✅ EPUB meets streaming threshold' : '❌ EPUB below streaming threshold', {
        fileSize,
        fileSizeKB: Math.round(fileSize / 1024),
        epubThresholdKB: Math.round(epubThreshold / 1024),
        shouldStream
      });
      return shouldStream;
    }

    // For PDFs, use streaming for files over 300KB (same as EPUB)
    if (fileData.mimetype === 'application/pdf') {
      const pdfThreshold = 300 * 1024;
      const shouldStream = fileSize > pdfThreshold;
      this.logger.info(shouldStream ? '✅ PDF meets streaming threshold' : '❌ PDF below streaming threshold', {
        fileSize,
        fileSizeKB: Math.round(fileSize / 1024),
        pdfThresholdKB: Math.round(pdfThreshold / 1024),
        shouldStream
      });
      return shouldStream;
    }

    // For DOCX, use streaming for files over 2MB
    if (fileData.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' && fileSize > 2 * 1024 * 1024) {
      this.logger.info('✅ DOCX meets streaming threshold');
      return true;
    }

    this.logger.info('❌ File does not meet any streaming criteria');
    return false;
  }

  /**
   * Safely parse JSON with fallback for malformed data
   * @private
   */
  _safeJSONParse(jsonString) {
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      this.logger.warn('Failed to parse JSON field', {
        error: error.message,
        data: jsonString?.substring(0, 100)
      });
      return jsonString; // Return as string if not valid JSON
    }
  }
}

module.exports = BackgroundQueueService;