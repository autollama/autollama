#!/usr/bin/env node

/**
 * Test Airtable connection directly
 */

const fetch = require('node-fetch');

const AIRTABLE_API_KEY = 'pat9Xj5Fwn6cY5CeW.31352d792c86e4640793c99051db81d06675675dbf0fd942581de78076ba2e5d';
const AIRTABLE_BASE_ID = 'appi5lnDWjvstGsqr';
const AIRTABLE_TABLE_ID = 'tblrO3XjykQIqURb4';

async function testAirtable() {
    console.log('🧪 Testing Airtable connection...');
    console.log(`Base: ${AIRTABLE_BASE_ID}`);
    console.log(`Table: ${AIRTABLE_TABLE_ID}`);
    console.log('');
    
    try {
        // Test 1: Simple list with no filter
        console.log('📋 Test 1: Simple list (max 5 records)');
        const url1 = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?pageSize=5`;
        
        console.log(`URL: ${url1}`);
        const response1 = await fetch(url1, {
            headers: {
                'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log(`Status: ${response1.status}`);
        if (response1.ok) {
            const data1 = await response1.json();
            console.log(`✅ Success: ${data1.records.length} records retrieved`);
            if (data1.records.length > 0) {
                console.log(`First record fields: ${Object.keys(data1.records[0].fields).join(', ')}`);
            }
        } else {
            const errorText = await response1.text();
            console.log(`❌ Error: ${errorText}`);
        }
        
        console.log('');
        
        // Test 2: With recent filter (this is what's failing)
        console.log('📋 Test 2: Recent records filter (last 24 hours)');
        const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const formula = `AND(IS_AFTER({Created Time}, '${cutoffDate}'))`;
        const url2 = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?pageSize=5&filterByFormula=${encodeURIComponent(formula)}`;
        
        console.log(`Formula: ${formula}`);
        console.log(`URL: ${url2}`);
        
        const response2 = await fetch(url2, {
            headers: {
                'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log(`Status: ${response2.status}`);
        if (response2.ok) {
            const data2 = await response2.json();
            console.log(`✅ Success: ${data2.records.length} recent records found`);
        } else {
            const errorText = await response2.text();
            console.log(`❌ Error: ${errorText}`);
        }
        
        console.log('');
        
        // Test 3: List available fields
        console.log('📋 Test 3: Check field names');
        const response3 = await fetch(url1, {
            headers: {
                'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response3.ok) {
            const data3 = await response3.json();
            if (data3.records.length > 0) {
                console.log('Available fields:');
                Object.keys(data3.records[0].fields).forEach(field => {
                    console.log(`  - ${field}`);
                });
                
                // Check if Created Time field exists
                if (data3.records[0].fields['Created Time']) {
                    console.log(`✅ 'Created Time' field exists: ${data3.records[0].fields['Created Time']}`);
                } else {
                    console.log(`❌ 'Created Time' field missing`);
                    console.log('Available time-related fields:');
                    Object.keys(data3.records[0].fields).forEach(field => {
                        if (field.toLowerCase().includes('time') || field.toLowerCase().includes('date') || field.toLowerCase().includes('created')) {
                            console.log(`  - ${field}: ${data3.records[0].fields[field]}`);
                        }
                    });
                }
            }
        }
        
    } catch (error) {
        console.error('💥 Test failed:', error.message);
    }
}

testAirtable();