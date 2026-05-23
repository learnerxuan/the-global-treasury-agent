import { proofToolFixtures } from "../lib/recon/extraction/fixtures.js";
import { runExtractionAgent } from "../lib/recon/extraction/extraction-agent.js";

for (const fixture of proofToolFixtures) {
  const result = await runExtractionAgent(fixture.descriptor);

  console.log("\n---");
  console.log(`File: ${fixture.descriptor.fileName}`);
  console.log(`Detected type: ${fixture.descriptor.mimeType}`);
  console.log(`Selected route: ${result.extraction.aiMetadata.extractionRoute}`);
  console.log(`Confidence: ${result.extraction.aiMetadata.overallConfidence}`);
  console.log(`Manual review: ${result.extraction.aiMetadata.requiresManualReview}`);
  console.log("Financial payload:");
  console.log(JSON.stringify(result.extraction.financialPayload, null, 2));
  console.log("Timeline:");
  for (const event of result.timeline) {
    console.log(`- ${event.agent}: ${event.action} -> ${event.resultSummary}`);
  }
}
