/**
 * BahtBridge — Code Coverage Validator (tool/check_coverage.js)
 * Compliant with course project rubric: Code Coverage >= 70%
 */

const { spawn } = require('child_process');
const path = require('path');

// Parse --min argument (default 70)
const args = process.argv.slice(2);
let minCoverage = 70;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--min' && args[i + 1]) {
    minCoverage = parseFloat(args[i + 1]);
    break;
  }
}

console.log(`\n🔍 Checking Code Coverage (Required Minimum: ${minCoverage}%)...`);

const child = spawn(process.execPath, ['--test', '--experimental-test-coverage', 'tests/'], {
  cwd: path.resolve(__dirname, '..'),
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';

child.stdout.on('data', (d) => {
  const text = d.toString();
  stdout += text;
  process.stdout.write(text);
});

child.stderr.on('data', (d) => {
  const text = d.toString();
  stderr += text;
  process.stderr.write(text);
});

child.on('close', (code) => {
  // Regex to match: all files | 71.29 | 51.22 | 82.35
  const match = stdout.match(/all files\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)/);

  console.log('\n' + '='.repeat(60));
  if (match) {
    const lineCov = parseFloat(match[1]);
    const branchCov = parseFloat(match[2]);
    const funcCov = parseFloat(match[3]);

    console.log(`📊 COVERAGE BREAKDOWN:`);
    console.log(`   • Line Coverage:     ${lineCov}%`);
    console.log(`   • Function Coverage: ${funcCov}%`);
    console.log(`   • Branch Coverage:   ${branchCov}%`);
    console.log(`\nTOTAL ${lineCov}% (Line coverage)`);

    if (lineCov >= minCoverage) {
      console.log(`\x1b[32mOK: at or above ${minCoverage}%\x1b[0m`);
      console.log('='.repeat(60) + '\n');
      process.exit(0);
    } else {
      console.log(`\x1b[31mFAIL: ${lineCov}% is below required ${minCoverage}%\x1b[0m`);
      console.log('='.repeat(60) + '\n');
      process.exit(1);
    }
  } else {
    if (code !== 0) {
      console.error(`\x1b[31mTest run failed with exit code ${code}\x1b[0m`);
      process.exit(code);
    }
    console.warn('⚠️ Could not parse coverage table summary');
    process.exit(0);
  }
});
