// agent/cli.ts
//
// Thin headless harness (D-01): `tsx agent/cli.ts "is Meridian actually healthy?"`.
// Runs the agent and prints ONLY the envelope JSON. It never prints env or secrets
// (Security Domain / T-05-14) — askQuestion() loads .env via dotenv override internally
// and the OPENAI_API_KEY / ARANGO_PASSWORD are never serialized into the envelope.

import { askQuestion } from './src/index.js';

async function main(): Promise<void> {
  const question = process.argv.slice(2).join(' ').trim();
  if (!question) {
    // Usage goes to stderr; stdout stays pure envelope JSON for piping.
    process.stderr.write('Usage: tsx agent/cli.ts "<question>"\n');
    process.exit(2);
  }

  const envelope = await askQuestion(question);
  process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
}

main().catch((err) => {
  process.stderr.write(`agent error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
