Agent-Based/
│
├── src/
│   │
│   ├── server.ts
│   ├── app.ts
│   │
│   ├── api/
│   │   └── chat/
│   │       ├── chat.route.ts
│   │       ├── chat.controller.ts
│   │       └── chat.types.ts
│   │
│   ├── orchestrator/
│   │   ├── orchestrator.ts
│   │   ├── intentClassifier.ts -> intent Nlp, Map, Confidence, Fallback
│   │   ├── taskPlanner.ts -> task.types.ts
│   │   ├── confidenceEvaluator.ts
│   │   └── responseSynthesizer.ts
│   │
│   ├── agents/
│   │   ├── base/
│   │   │   ├── BaseAgent.ts
│   │   │   └── AgentResult.ts
│   │   │
│   │   ├── monument/
│   │   │   ├── monument.agent.ts -> name, description
│   │   │   ├── monument.reasoning.ts
│   │   │   └── monument.confidence.ts
│   │   │
│   │   ├── civilization/
│   │   │   ├── civilization.agent.ts -> civilization, religion
│   │   │   ├── civilization.reasoning.ts
│   │   │   └── civilization.confidence.ts
│   │   │
│   │   ├── architecture/
│   │   │   ├── architecture.agent.ts -> architecture, material
│   │   │   ├── architecture.reasoning.ts
│   │   │   └── architecture.confidence.ts
│   │   │
│   │   ├── timeline/
│   │   │   ├── timeline.agent.ts
│   │   │   ├── timeline.reasoning.ts
│   │   │   └── timeline.confidence.ts
│   │   │
│   │   └── geo/
│   │       ├── geo.agent.ts
│   │       └── geo.reasoning.ts
│   │
│   ├── knowledge/
│   │   ├── db/
│   │   │   ├── postgres.ts
│   │   │   └── queries.ts
│   │   │
│   │   ├── models/
│   │   │   └── HeritageSite.model.ts
│   │   │
│   │   └── repositories/
│   │       └── heritage.repository.ts
│   │
│   ├── external/
│   │   ├── llm/
│   │   │   └── gemini.client.ts
│   │   │
│   │   └── safety/
│   │       └── escalation.guard.ts
│   │
│   ├── utils/
│   │   ├── textUtils.ts
│   │   ├── scoringUtils.ts -> no use
│   │   └── logger.ts
│   │
│   ├── config/
│   │   ├── env.ts
│   │   └── constants.ts
│   │
│   └── types/
│       ├── agent.types.ts
│       ├── chat.types.ts
│       └── heritage.types.ts
│
├── prisma/ (optional if using ORM)
│
├── .env
├── tsconfig.json
├── package.json
└── README.md






+----------------------------------------------------+
|                    USER (Browser)                  |
|        (Chat UI / Map / Site Interaction)          |
+--------------------------+-------------------------+
                           |
                           v
+----------------------------------------------------+
|            FRONTEND (Next.js / React)              |
|  - Chat Interface                                  |
|  - Context (Selected Site / Location)              |
|  - Session Handling                                |
+--------------------------+-------------------------+
                           |
                           v
+----------------------------------------------------+
|              API GATEWAY / EDGE LAYER              |
|  - Authentication                                  |
|  - Rate Limiting                                   |
|  - Input Validation                                |
|  - Logging & Monitoring                            |
+--------------------------+-------------------------+
                           |
                           v
  +----------------------------------------------------+
  |            MAIN ORCHESTRATOR AGENT                 |
  |  - Intent Classification                           |
  |  - Entity Extraction                               |
  |  - Task Planning                                   |
  |  - Confidence Evaluation                           |
  +--------------------------+-------------------------+
            |                |                 |
            |                |                 |
            v                v                 v
+----------------+  +------------------+  +------------------+
| Monument Agent |  | Civilization     |  | Architecture     |
|                |  | Agent            |  | Agent            |
| - Site facts   |  | - Dynasty info   |  | - Style, material|
| - Era, region  |  | - Culture        |  | - Design         |
+-------+--------+  +--------+---------+  +--------+---------+
        |                    |                     |
        v                    v                     v
+----------------+  +------------------+  +------------------+
| Monument KB    |  | Civilization KB  |  | Architecture KB  |
| (Structured /  |  | (Structured /    |  | (Structured /    |
| Vector DB)     |  | Vector DB)       |  | Vector DB)       |
+----------------+  +------------------+  +------------------+
                             |
                             v
	+----------------------------------------------------+
	|         CONFIDENCE & DECISION MODULE               |
	|  - Sufficiency Check                               |
	|  - Missing Info Detection                          |
	|  - Risk Scoring                                    |
	+--------------------------+-------------------------+
            |                                   |
            | (Sufficient)                      | (Insufficient)
            v                                   v
+----------------------------+   +--------------------------------+
|   RESPONSE SYNTHESIS       |   |  EXTERNAL LLM AGENT (Gemini)   |
|  - Merge agent outputs     |   |  - Historical reasoning        |
|  - Explain uncertainty     |   |  - Context-limited querying    |
+--------------+-------------+   +----------------+---------------+
               |                                  |
               +------------------+---------------+
								  |
                                  v
                  +--------------------------------+
                  |      RESPONSE SYNTHESIS        |
                  |  - Final answer generation     |
                  |  - Confidence tagging          |
                  |  - Source awareness            |
                  +----------------+---------------+
                                   |
                                   v
		+----------------------------------------------------+
		|                    FRONTEND UI                     |
		|     - Answer Display                               |
		|     - Confidence Indicator                         |
		|     - Follow-up Questions                          |
		+----------------------------------------------------+
