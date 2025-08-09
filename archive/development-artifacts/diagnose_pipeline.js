
const Mercury = require('@postlight/mercury-parser');

async function fetchAndParse(url) {
    console.log(`[1/2] Fetching and parsing content from: ${url}`);
    try {
        const result = await Mercury.parse(url);
        console.log('✅ Fetch and parse successful.');
        return result.content;
    } catch (error) {
        console.error('❌ Fetch and parse failed:', error.message);
        throw error;
    }
}

async function main() {
    const url = process.argv[2];
    if (!url) {
        console.error('Please provide a URL as an argument.');
        process.exit(1);
    }

    try {
        const markdown = await fetchAndParse(url);
        console.log(`✅ Conversion successful. Markdown length: ${markdown.length}`);
        console.log('\n✨ Pipeline test completed successfully.');
    } catch (error) {
        console.error('\n🔥 Pipeline test failed.');
        process.exit(1);
    }
}

main();
