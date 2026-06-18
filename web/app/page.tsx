// Phase 6 dashboard shell (Wave 0 placeholder).
//
// Wave 0 only scaffolds the workspace, theme, and test fixtures. The real
// dashboard (QuestionBox → AnswerBody/RefusalPanel + the persistent SourcingRail)
// is built in later waves against the UI-SPEC and the Envelope fixtures.

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-4 px-6 py-16">
      <h1 className="text-[28px] font-semibold leading-tight">
        Ask across both graphs.
      </h1>
      <p className="text-base text-muted-foreground">
        Every answer is traced to the record, graph, and query it came from.
      </p>
    </main>
  );
}
