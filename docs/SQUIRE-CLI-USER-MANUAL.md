# Squire CLI User Manual

**Version 0.1.0** | December 2025

Squire is a personal AI memory system that stores, searches, and surfaces relevant context from your observations. It learns what matters to you through salience scoring and forms connections between related memories over time.

---

## Quick Start

```bash
# Check system health
squire status

# Store a memory
squire observe "Met with Sarah about the Quantum project deadline"

# Search memories
squire search "project deadlines"

# Get context for AI consumption
squire context --query "what am I working on"

# Run memory consolidation (decay, strengthen, form connections)
squire consolidate
```

---

## Installation

Squire requires:
- Node.js 18+
- PostgreSQL with pgvector extension
- Ollama running locally (for embeddings)

```bash
# Clone and install
git clone https://github.com/RidgetopAi/squier.git
cd squier
npm install

# Set up environment
cp .env.example .env
# Edit .env with your database credentials

# Start PostgreSQL (via Docker)
docker compose up -d

# Run migrations
for f in schema/*.sql; do psql $DATABASE_URL -f "$f"; done

# Build
npm run build

# Link CLI globally (optional)
npm link
```

---

## Commands

### observe

Store a new observation as a memory. Automatically calculates salience score and extracts entities.

```bash
squire observe "content to remember"
```

**Options:**
- `-s, --source <source>` - Source of observation (default: "cli")
- `-t, --type <type>` - Content type (default: "text")

**Examples:**
```bash
# Basic observation
squire observe "Need to buy groceries - milk, eggs, bread"

# With source metadata
squire observe "Discussed pricing with client" --source meeting

# High-salience observation (detected automatically)
squire observe "Sarah offered me the CTO position - deadline to decide is Friday"
```

**Output:**
```
Memory stored successfully!
  ID: d2b62af3
  Salience: 5.1
  Created: 12/25/2025, 10:00:24 PM
  Entities: Sarah (person), Quantum (project)
```

**Salience Scoring:**
Memories are scored 0-10 based on:
- Temporal markers (dates, deadlines) → +salience
- Relationship markers (names, "met with") → +salience
- Action language (commitments, decisions) → +salience
- Explicit markers ("important", "remember") → +salience
- Self-reference ("I feel", "I decided") → +salience
- Content length and complexity → +salience

---

### list

List stored memories with optional filtering.

```bash
squire list [options]
```

**Options:**
- `-l, --limit <limit>` - Maximum memories to show (default: 10)
- `-s, --source <source>` - Filter by source

**Examples:**
```bash
# List recent memories
squire list

# Show more memories
squire list --limit 50

# Filter by source
squire list --source meeting
```

**Output:**
```
Memories (3 of 15):

[d2b62af3] 12/25/2025, 10:00:24 PM
  Met with Sarah Chen about the Quantum project deadline
  salience: 3 | source: cli

[808bc07f] 12/25/2025, 10:00:14 PM
  Had a meeting with Dr. Robert Smith from Acme Corp...
  salience: 2.6 | source: cli
```

---

### search

Semantic search for memories using vector similarity combined with salience ranking.

```bash
squire search "query" [options]
```

**Options:**
- `-l, --limit <limit>` - Maximum results (default: 10)
- `-m, --min-similarity <min>` - Minimum similarity threshold 0-1 (default: 0.3)

**Examples:**
```bash
# Basic search
squire search "project deadlines"

# Find people-related memories
squire search "meetings with Sarah"

# High-precision search
squire search "CTO decision" --min-similarity 0.5
```

**Output:**
```
Searching for: "CTO decision"

Found 3 matching memories:

[86fbc0d8] score: 61.7%
  Sarah offered me the CTO position - deadline to decide is Friday
  12/25/2025, 9:12:17 PM | similarity: 68.8% | salience: 5.1

[b0b633d5] score: 52.9%
  Sarah offered me the CTO position...
  12/25/2025, 9:11:05 PM | similarity: 68.8% | salience: 2.9
```

**How Scoring Works:**
- `score` = (similarity × 0.6) + (normalized_salience × 0.4)
- High-salience memories rank higher even with slightly lower similarity
- Important things float to the top

---

### context

Generate a context package for AI consumption. This is what you'd inject into a Claude/GPT conversation.

```bash
squire context [options]
```

**Options:**
- `-p, --profile <name>` - Context profile: general, work, personal, creative
- `-q, --query <query>` - Focus context on this topic
- `-t, --max-tokens <tokens>` - Maximum tokens in output
- `--json` - Output as JSON instead of markdown

**Examples:**
```bash
# Default context (general profile)
squire context

# Work-focused context
squire context --profile work

# Context about a specific topic
squire context --query "Quantum project"

# For programmatic use
squire context --json
```

**Output (Markdown):**
```markdown
# Context for AI Assistant

## Key Entities
**Persons:** Sarah Chen, Dr. Robert Smith
**Projects:** Quantum, Phoenix

## High-Priority Memories
- Sarah offered me the CTO position - deadline to decide is Friday (salience: 5.1)

## Recent Context
- Met with Sarah Chen about the Quantum project deadline
- Had a meeting with Dr. Robert Smith from Acme Corp...

## Relevant to Query
- The AI project uses vector embeddings for semantic search

---
Tokens: ~450 | Memories: 8 | Disclosure: a3b4c5d6
```

**Profiles:**

| Profile | Focus | Min Salience | Max Tokens |
|---------|-------|--------------|------------|
| general | Balanced | 3.0 | 4000 |
| work | Projects, deadlines | 4.0 | 4000 |
| personal | Relationships | 2.0 | 3000 |
| creative | Ideas, exploration | 2.0 | 5000 |

---

### profiles

List available context profiles and their settings.

```bash
squire profiles
```

**Output:**
```
Context Profiles:

  general (default)
    Balanced context for general use
    min_salience: 3 | max_tokens: 4000
    weights: sal=0.35 rel=0.30 rec=0.20 str=0.15

  work
    Work-focused: projects, deadlines, commitments
    min_salience: 4 | max_tokens: 4000
    weights: sal=0.40 rel=0.25 rec=0.25 str=0.10
```

---

### entities

List extracted entities (people, projects, places, organizations, concepts).

```bash
squire entities [options]
```

**Options:**
- `-t, --type <type>` - Filter by type: person, project, concept, place, organization
- `-l, --limit <limit>` - Maximum to show (default: 20)
- `-s, --search <query>` - Search by name

**Examples:**
```bash
# List all entities
squire entities

# Just people
squire entities --type person

# Search for an entity
squire entities --search "Sarah"
```

**Output:**
```
Entities

  Total: 7
  By type: person=3 project=2 place=0 org=1 concept=1

  [person] Sarah Chen
    mentions: 4 | last seen: 12/25/2025

  [project] Quantum
    mentions: 3 | last seen: 12/25/2025
```

---

### who

Query everything Squire knows about a person or entity.

```bash
squire who "name"
```

**Examples:**
```bash
squire who "Sarah"
squire who "Quantum project"
```

**Output:**
```
Sarah Chen
  Type: person
  Mentions: 4
  First seen: 12/25/2025
  Last seen: 12/25/2025

Related Memories:

  [d2b62af3] 12/25/2025
    Met with Sarah Chen about the Quantum project deadline
    salience: 3

  [86fbc0d8] 12/25/2025
    Sarah offered me the CTO position - deadline to decide is Friday
    salience: 5.1
```

---

### consolidate

Run memory consolidation: decay weak memories, strengthen important ones, form SIMILAR connections.

```bash
squire consolidate [options]
```

**Options:**
- `-v, --verbose` - Show detailed output including current state

**Examples:**
```bash
# Basic consolidation
squire consolidate

# With stats
squire consolidate --verbose
```

**Output:**
```
Running consolidation...

Consolidation complete!
  Memories processed: 15
  Decayed: 13
  Strengthened: 2
  Edges created: 10
  Edges reinforced: 0
  Edges pruned: 0
  Duration: 46ms

Current State:
  Active memories: 15
  Dormant memories: 0
  Total edges: 10
  Average edge weight: 1.00
```

**How It Works:**

1. **Decay**: Memories lose strength each cycle
   - Low salience + never accessed = faster decay
   - High salience + frequently accessed = slower decay
   - Minimum strength: 0.1 (dormant but still searchable)

2. **Strengthen**: Memories gain strength when:
   - Accessed recently
   - High salience (≥6.0)
   - Frequently accessed (≥3 times)

3. **SIMILAR Edges**: Connect memories with >75% embedding similarity
   - Max 10 edges per memory
   - Edges decay if not reinforced
   - Weak edges get pruned

---

### sleep

Friendly alias for consolidate. Same functionality, different vibe.

```bash
squire sleep [options]
```

**Options:**
- `-v, --verbose` - Show detailed output

**Output:**
```
Squire is sleeping... consolidating memories...

Squire wakes up refreshed!
  Processed 15 memories
  13 faded, 2 strengthened
  0 new connections formed
```

---

### related

Show memories connected to a given memory via SIMILAR edges.

```bash
squire related <memory-id> [options]
```

**Options:**
- `-l, --limit <limit>` - Maximum related memories (default: 10)

**Examples:**
```bash
# Use full UUID
squire related 1d191056-8870-4568-a6f8-b7809935f9b7

# (Partial IDs not yet supported - use squire list to find IDs)
```

**Output:**
```
Memory: 1d191056
  Met with Sarah Chen about the Quantum project deadline
  salience: 3 | strength: 0.94

Connected Memories (2):

  [d2b62af3] weight: 1.00 | similarity: 100%
    Met with Sarah Chen about the Quantum project deadline

  [4b6b6744] weight: 1.00 | similarity: 75%
    Met Sarah to discuss the AI project due next Friday
```

---

### status

Check system health and statistics.

```bash
squire status
```

**Output:**
```
Squire Status

  Database: Connected
  Embedding: Connected
    Provider: ollama
    Model: nomic-embed-text
    Dimension: 768
  LLM: Connected
    Provider: groq
    Model: llama-3.3-70b-versatile
    Configured: Yes
  Memories: 15 (15 active, 0 dormant)
  Entities: 7
  Edges: 10 SIMILAR connections
```

---

## Typical Workflows

### Daily Capture

```bash
# Throughout the day, observe things that matter
squire observe "Morning standup - team blocked on API integration"
squire observe "1:1 with Sarah - she's considering leaving if project scope doesn't shrink"
squire observe "Realized the authentication bug is in the middleware, not the handler"
squire observe "Client meeting pushed to Thursday, they need more time to review proposal"

# End of day - let Squire consolidate
squire sleep
```

### Preparing for a Meeting

```bash
# Get context about the person/topic
squire who "Sarah"
squire search "project deadlines"
squire context --query "Sarah Chen meetings" --profile work
```

### AI Context Injection

```bash
# Get context to paste into Claude/GPT
squire context --query "current priorities" > context.md

# Or for programmatic use
squire context --json | jq '.memories[].content'
```

### Understanding Connections

```bash
# Run consolidation to form connections
squire consolidate

# Explore what's connected
squire related <memory-id>

# Check status
squire status
```

---

## Configuration

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5435/squier

# Embeddings (Ollama)
EMBED_PROVIDER=ollama
EMBED_MODEL=nomic-embed-text
EMBED_DIMENSION=768
OLLAMA_URL=http://localhost:11434

# LLM (optional, for future features)
GROQ_API_KEY=your_key_here
LLM_PROVIDER=groq
LLM_MODEL=llama-3.3-70b-versatile
```

### Consolidation Parameters

Edit `src/services/consolidation.ts` to tune:

```typescript
CONSOLIDATION_CONFIG = {
  decay: {
    baseRate: 0.05,           // 5% decay per cycle
    minStrength: 0.1,         // Dormant threshold
    accessDecayDays: 7,       // Days before "stale"
    unaccessed_multiplier: 1.5,
  },
  strengthen: {
    baseGain: 0.1,
    maxStrength: 1.0,
    frequentAccessThreshold: 3,
    highSalienceThreshold: 6.0,
  },
  edges: {
    similarityThreshold: 0.75,
    maxEdgesPerMemory: 10,
    edgeDecayRate: 0.1,
    minEdgeWeight: 0.2,
  },
}
```

---

## Concepts

### Salience

A 0-10 score indicating how important a memory is. Calculated automatically based on:
- **Temporal markers**: Dates, deadlines, "next Friday"
- **Relationships**: People names, "met with", "discussed with"
- **Actions**: Commitments, decisions, "I will", "agreed to"
- **Explicit**: "Important", "remember", "key"
- **Self-reference**: "I feel", "I think", "I decided"

High-salience memories resist decay and rank higher in search.

### Strength

A 0-1 value representing memory vitality. Starts at 1.0 and:
- **Decays** each consolidation cycle (less for high-salience, accessed memories)
- **Strengthens** when accessed, high-salience, or frequently used
- Below 0.1 = dormant (still searchable but deprioritized)

### SIMILAR Edges

Graph connections between semantically similar memories (>75% embedding similarity). Edges:
- Form automatically during consolidation
- Strengthen when both memories remain similar
- Decay if not reinforced
- Get pruned when weight drops below 0.2

### Context Profiles

Preset configurations for context injection:
- Different weights for salience/relevance/recency/strength
- Different token budgets
- Different minimum salience thresholds

---

## Troubleshooting

### "Embedding: Disconnected"

Ollama isn't running or the model isn't pulled:
```bash
ollama serve
ollama pull nomic-embed-text
```

### "Database: Disconnected"

PostgreSQL isn't running:
```bash
docker compose up -d
```

### No search results

Try lowering the similarity threshold:
```bash
squire search "query" --min-similarity 0.2
```

### Memories not connecting

Run consolidation to form SIMILAR edges:
```bash
squire consolidate
```

---

## API Reference

Squire also exposes a REST API on port 3000:

```bash
npm run server
```

- `GET /api/health` - Health check
- `GET /api/memories` - List memories
- `POST /api/memories` - Create memory
- `GET /api/memories/search?query=X` - Search
- `POST /api/context` - Generate context
- `GET /api/entities` - List entities
- `GET /api/entities/who/:name` - Query entity
- `POST /api/consolidation/run` - Run consolidation
- `GET /api/consolidation/stats` - Get stats

---

*Last Updated: December 25, 2025*
