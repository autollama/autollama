#!/usr/bin/env node

/**
 * AutoLlama Configuration Diagnostic Tool
 * 
 * This script helps diagnose configuration issues that prevent
 * EPUB and file processing from working correctly.
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 AutoLlama Configuration Diagnostic\n');

// Check if .env file exists
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
    console.log('❌ Missing .env file');
    console.log('   Solution: Copy example.env to .env and configure with your API keys');
    process.exit(1);
}

// Load environment variables
require('dotenv').config();

console.log('📋 Configuration Status:\n');

// Check OpenAI API Key
const openaiKey = process.env.OPENAI_API_KEY;
if (!openaiKey || openaiKey === 'your_openai_api_key_here') {
    console.log('❌ OpenAI API Key: NOT CONFIGURED');
    console.log('   Current value: ' + (openaiKey || 'undefined'));
    console.log('   Required for: AI analysis and contextual embeddings');
    console.log('   Get key from: https://platform.openai.com/api-keys');
} else {
    console.log('✅ OpenAI API Key: CONFIGURED');
    console.log('   Preview: ' + openaiKey.substring(0, 8) + '...');
}

// Check Qdrant Configuration
const qdrantUrl = process.env.QDRANT_URL;
const qdrantKey = process.env.QDRANT_API_KEY;

if (!qdrantUrl || qdrantUrl === 'your_qdrant_url_here') {
    console.log('❌ Qdrant URL: NOT CONFIGURED');
    console.log('   Current value: ' + (qdrantUrl || 'undefined'));
    console.log('   Required for: Vector storage and semantic search');
} else {
    console.log('✅ Qdrant URL: CONFIGURED');
    console.log('   URL: ' + qdrantUrl);
}

if (!qdrantKey || qdrantKey === 'your_qdrant_api_key_here') {
    console.log('❌ Qdrant API Key: NOT CONFIGURED');
    console.log('   Current value: ' + (qdrantKey || 'undefined'));
    console.log('   Required for: Vector storage authentication');
} else {
    console.log('✅ Qdrant API Key: CONFIGURED');
    console.log('   Preview: ' + qdrantKey.substring(0, 8) + '...');
}

// Check Database Configuration
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
    console.log('❌ Database URL: NOT CONFIGURED');
    console.log('   Required for: Metadata storage');
} else {
    console.log('✅ Database URL: CONFIGURED');
}

// Check contextual embeddings setting
const contextualEnabled = process.env.ENABLE_CONTEXTUAL_EMBEDDINGS;
console.log('\n🧠 Contextual Embeddings: ' + (contextualEnabled === 'true' ? 'ENABLED' : 'DISABLED'));

console.log('\n🚨 DIAGNOSIS SUMMARY:');
console.log('');

const missingConfigs = [];
if (!openaiKey || openaiKey === 'your_openai_api_key_here') {
    missingConfigs.push('OpenAI API Key');
}
if (!qdrantUrl || qdrantUrl === 'your_qdrant_url_here') {
    missingConfigs.push('Qdrant URL');
}
if (!qdrantKey || qdrantKey === 'your_qdrant_api_key_here') {
    missingConfigs.push('Qdrant API Key');
}

if (missingConfigs.length > 0) {
    console.log('❌ EPUB and file processing will FAIL due to missing configuration:');
    missingConfigs.forEach(config => console.log('   - ' + config));
    
    console.log('\n🔧 TO FIX:');
    console.log('1. Edit the .env file in the autollama directory');
    console.log('2. Replace placeholder values with your actual API keys:');
    console.log('   - Get OpenAI API key: https://platform.openai.com/api-keys');
    console.log('   - Get Qdrant credentials: https://cloud.qdrant.io/');
    console.log('3. Restart the containers: docker compose restart');
    console.log('');
    console.log('💡 Until configured, all file uploads will show fake progress and fail.');
} else {
    console.log('✅ All required configurations are present!');
    console.log('   EPUB and file processing should work correctly.');
}

console.log('\n📊 Recent Failed Sessions:');

// Try to check recent failed sessions if we can connect to the database
try {
    const { Pool } = require('pg');
    if (dbUrl && dbUrl !== 'your_database_url_here') {
        const pool = new Pool({ connectionString: dbUrl });
        
        pool.query(`
            SELECT filename, status, error_message, created_at 
            FROM upload_sessions 
            WHERE status = 'failed' 
            ORDER BY created_at DESC 
            LIMIT 5
        `).then(result => {
            if (result.rows.length > 0) {
                console.log('   Recent failures:');
                result.rows.forEach(row => {
                    console.log(`   - ${row.filename} (${row.created_at.toISOString().split('T')[0]}): ${row.error_message || 'Unknown error'}`);
                });
            } else {
                console.log('   No recent failures found');
            }
            pool.end();
        }).catch(err => {
            console.log('   Could not check database: ' + err.message);
            pool.end();
        });
    } else {
        console.log('   Cannot check database - DATABASE_URL not configured');
    }
} catch (err) {
    console.log('   Database check unavailable: ' + err.message);
}