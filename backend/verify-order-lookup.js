const decodeAndNormalize = (id) => {
  if (!id) return [];
  const decodedId = id ? decodeURIComponent(id) : "";
  const normalized = decodedId.replace(/\s+/g, "").replace(/ORD-?/i, "ORD-").trim();
  
  const variants = [id, decodedId, normalized];
  if (normalized.startsWith("ORD-")) {
    const parts = normalized.split("-");
    if (parts.length === 3) {
      variants.push(`ORD - ${parts[1]} -${parts[2]} `);
    }
  }
  return [...new Set(variants.filter(Boolean))];
};

const testCases = [
  { input: "ORD-123-456", expectedToMatch: "ORD-123-456" },
  { input: "ORD-123-456", expectedToMatch: "ORD - 123 -456 " },
  { input: "ORD%20-%20123%20-%20456%20", expectedToMatch: "ORD - 123 -456 " },
  { input: "ORD%20-%20123%20-456%20", expectedToMatch: "ORD - 123 -456 " },
  { input: "ORD-123-456", expectedToMatch: "ORD-123-456" }
];

console.log("Running Order ID Lookup Normalization Tests...");
let failed = false;

testCases.forEach(({ input, expectedToMatch }, index) => {
  const variants = decodeAndNormalize(input);
  const match = variants.includes(expectedToMatch);
  console.log(`Test Case ${index + 1}: Input: "${input}" | Searching for: "${expectedToMatch}" | Found match: ${match}`);
  if (!match) {
    console.log("  Variants found:", variants);
    failed = true;
  }
});

if (!failed) {
  console.log("✅ All lookup normalization tests passed!");
} else {
  console.log("❌ Some tests failed.");
  process.exit(1);
}
