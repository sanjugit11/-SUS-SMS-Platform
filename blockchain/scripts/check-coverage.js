const fs = require("fs");
const path = require("path");

const minimum = 90;
const lcovPath = path.resolve(__dirname, "../../coverage/lcov.info");
const lcov = fs.readFileSync(lcovPath, "utf8");

const totals = {
  functionsFound: 0,
  functionsHit: 0,
  linesFound: 0,
  linesHit: 0
};

for (const record of lcov.split("end_of_record")) {
  const source = record.match(/^SF:(.+)$/m)?.[1];
  if (!source) continue;
  if (!source.includes("/blockchain/contracts/") || source.includes("/blockchain/contracts/mocks/")) continue;

  totals.functionsFound += Number(record.match(/^FNF:(\d+)$/m)?.[1] || 0);
  totals.functionsHit += Number(record.match(/^FNH:(\d+)$/m)?.[1] || 0);
  totals.linesFound += Number(record.match(/^LF:(\d+)$/m)?.[1] || 0);
  totals.linesHit += Number(record.match(/^LH:(\d+)$/m)?.[1] || 0);
}

const statements = totals.linesFound === 0 ? 100 : (totals.linesHit / totals.linesFound) * 100;
const functions = totals.functionsFound === 0 ? 100 : (totals.functionsHit / totals.functionsFound) * 100;
const lines = statements;

const results = { statements, functions, lines };
const failures = Object.entries(results).filter(([, value]) => value < minimum);

console.log(
  `Production contract coverage: statements ${statements.toFixed(2)}%, functions ${functions.toFixed(2)}%, lines ${lines.toFixed(2)}%`
);

if (failures.length > 0) {
  console.error(`Coverage gate failed. Minimum required: ${minimum}%.`);
  for (const [metric, value] of failures) {
    console.error(`- ${metric}: ${value.toFixed(2)}%`);
  }
  process.exit(1);
}
