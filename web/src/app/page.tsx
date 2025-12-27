export default function Home() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
      <main className="max-w-2xl w-full space-y-8 animate-fade-in">
        {/* Logo/Title */}
        <div className="text-center space-y-4">
          <h1 className="text-5xl font-bold text-primary glow-text-primary">
            Squire
          </h1>
          <p className="text-xl text-foreground-muted">
            AI memory that knows you
          </p>
        </div>

        {/* Theme Preview Card */}
        <div className="glass rounded-xl p-6 space-y-6">
          <h2 className="text-lg font-semibold text-foreground">
            Cyber-Futuristic Theme
          </h2>

          {/* Salience Scale */}
          <div className="space-y-2">
            <p className="text-sm text-foreground-muted">Salience Scale</p>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => (
                <div
                  key={level}
                  className={`w-8 h-8 rounded-md bg-salience-${level} salience-glow-${level} flex items-center justify-center text-xs font-mono`}
                >
                  {level}
                </div>
              ))}
            </div>
          </div>

          {/* Entity Colors */}
          <div className="space-y-2">
            <p className="text-sm text-foreground-muted">Entity Types</p>
            <div className="flex flex-wrap gap-2">
              {[
                { name: 'Person', color: 'entity-person' },
                { name: 'Organization', color: 'entity-organization' },
                { name: 'Location', color: 'entity-location' },
                { name: 'Project', color: 'entity-project' },
                { name: 'Concept', color: 'entity-concept' },
                { name: 'Event', color: 'entity-event' },
              ].map(({ name, color }) => (
                <span
                  key={name}
                  className={`px-3 py-1 rounded-full text-xs font-medium bg-${color}/20 text-${color} border border-${color}/30`}
                >
                  {name}
                </span>
              ))}
            </div>
          </div>

          {/* Accent Colors */}
          <div className="space-y-2">
            <p className="text-sm text-foreground-muted">Accents</p>
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-primary glow-primary" />
                <span className="text-sm">Primary</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-accent-gold glow-gold" />
                <span className="text-sm">Gold</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-accent-purple" />
                <span className="text-sm">Purple</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-accent-magenta" />
                <span className="text-sm">Magenta</span>
              </div>
            </div>
          </div>
        </div>

        {/* Animated Border Demo */}
        <div className="animated-border p-6 text-center">
          <p className="text-foreground-muted">
            Animated gradient border effect
          </p>
        </div>

        {/* Status */}
        <div className="text-center text-sm text-foreground-muted">
          <p>Phase 0: Scaffolding in progress</p>
          <p className="text-primary mt-2">Next.js 16 + React 19 + Tailwind 4</p>
        </div>
      </main>
    </div>
  );
}
