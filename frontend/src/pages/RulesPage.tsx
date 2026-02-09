export function RulesPage() {
  return (
    <section className="page-shell">
      <div className="page-head">
        <div>
          <p className="eyebrow">Reference</p>
          <h1>Rules</h1>
          <p className="muted-text">Contest rules and battle protocol documentation.</p>
        </div>
      </div>
      <div className="card">
        <iframe title="rules" src="/rules-static/index.html" className="rules-frame" />
      </div>
    </section>
  );
}
