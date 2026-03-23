export interface PatternNode {
  name: string;
  role: string;
  description: string;
}

export interface SuggestedScenario {
  label: string;
  description: string;
  requestCount: number;
  requestsPerSecond: number;
  failureInjection?: {
    nodeFailures?: Record<string, number>;
  };
}

export interface PatternContent {
  name: string;
  icon: string;
  tagline: string;
  description: string;
  whenToUse: string[];
  architectureMermaid: string;
  howItWorks: string[];
  nodes: PatternNode[];
  tradeoffs: {
    pros: string[];
    cons: string[];
  };
  suggestedScenarios: SuggestedScenario[];
}

const circuitBreaker: PatternContent = {
  name: "circuit-breaker",
  icon: "⚡",
  tagline: "Failure isolation via state machine",
  description:
    "Prevents cascading failures by wrapping calls in a state machine that monitors errors. After a threshold of consecutive failures, the breaker opens and fast-fails subsequent requests — protecting downstream services from overload and giving them time to recover.",
  whenToUse: [
    "Calling unreliable downstream services that may become unresponsive",
    "Preventing cascade failures in microservice architectures",
    "Protecting systems from thundering herd after partial outages",
    "Any RPC boundary where transient failures need fast detection and recovery",
  ],
  architectureMermaid: `graph LR
    Client[Client] --> CB[Circuit Breaker<br/>state machine]
    CB -->|CLOSED| Backend[Backend Service]
    CB -->|OPEN| FastFail[Fast Fail<br/>reject immediately]
    CB -->|HALF-OPEN| Probe[Probe Request]
    Probe -->|success| CB
    Probe -->|fail| FastFail
    Backend --> Response[Response]`,
  howItWorks: [
    "In the CLOSED state, all requests pass through to the backend service normally",
    "Each failure increments a consecutive-failure counter; successes reset it to zero",
    "When failures hit the threshold, the breaker transitions to OPEN — all requests are immediately rejected (fast-fail) without reaching the backend",
    "After a cooldown period, the breaker moves to HALF-OPEN and allows one probe request through",
    "If the probe succeeds, the breaker resets to CLOSED; if it fails, the breaker re-opens for another cooldown cycle",
  ],
  nodes: [
    {
      name: "client",
      role: "request-generator",
      description: "Generates requests at the configured rate (rps)",
    },
    {
      name: "breaker",
      role: "circuit-breaker",
      description:
        "State machine (Closed → Open → Half-Open) that monitors failures and fast-fails when open",
    },
    {
      name: "backend",
      role: "service",
      description:
        "Downstream service with configurable latency and failure rate",
    },
  ],
  tradeoffs: {
    pros: [
      "Prevents cascading failures across service boundaries",
      "Fast-fail reduces latency and resource usage during outages",
      "Automatic recovery detection via half-open probing",
      "Simple to reason about — only 3 states",
    ],
    cons: [
      "Threshold tuning is difficult — too low causes false trips, too high delays detection",
      "Cooldown period means legitimate requests are rejected during recovery",
      "Does not distinguish between transient and permanent failures",
      "Single-count threshold ignores failure rate (5 failures in 5 seconds vs 5 in 5 minutes)",
    ],
  },
  suggestedScenarios: [
    {
      label: "Healthy traffic",
      description: "10 requests with no failures — circuit stays closed",
      requestCount: 10,
      requestsPerSecond: 10,
    },
    {
      label: "50% backend failures",
      description: "Watch the breaker trip and fast-fail subsequent requests",
      requestCount: 12,
      requestsPerSecond: 5,
      failureInjection: { nodeFailures: { backend: 0.5 } },
    },
    {
      label: "Total backend outage",
      description: "100% failure rate — see the breaker open immediately",
      requestCount: 10,
      requestsPerSecond: 8,
      failureInjection: { nodeFailures: { backend: 1.0 } },
    },
  ],
};

const saga: PatternContent = {
  name: "saga",
  icon: "🔄",
  tagline: "Distributed transactions with compensating rollbacks",
  description:
    "Manages multi-step distributed transactions without distributed locks. An orchestrator executes a sequence of local transactions across services. If any step fails, it runs compensating actions in reverse order to undo completed steps — ensuring eventual consistency without two-phase commit.",
  whenToUse: [
    "Multi-service order processing (order → payment → inventory → shipping)",
    "Any workflow where partial completion must be rolled back on failure",
    "Replacing two-phase commit in microservice architectures",
    "Long-running business processes that span multiple bounded contexts",
  ],
  architectureMermaid: `graph LR
    Client[Client] --> Orch[Orchestrator<br/>saga coordinator]
    Orch -->|step 1| Order[Order Service]
    Orch -->|step 2| Payment[Payment Service]
    Orch -->|step 3| Inventory[Inventory Service]
    Orch -->|step 4| Shipping[Shipping Service]
    Inventory -.->|fail| Orch
    Orch -.->|compensate| Payment
    Orch -.->|compensate| Order`,
  howItWorks: [
    "The orchestrator receives a request and begins executing saga steps in sequence: Order → Payment → Inventory → Shipping",
    "Each service performs its local transaction and reports success or failure back to the orchestrator",
    "If all steps succeed, the saga completes and the orchestrator transitions to 'completed' state",
    "If any step fails, the orchestrator enters 'compensating' mode and calls compensation on all previously completed steps in reverse order",
    "Compensation undoes each step: refund payment, cancel order, release inventory — ensuring no partial state remains",
  ],
  nodes: [
    {
      name: "orchestrator",
      role: "saga-orchestrator",
      description:
        "Coordinates the saga: executes steps in sequence, triggers reverse compensation on failure",
    },
    {
      name: "order",
      role: "service",
      description: "Creates orders (forward) / cancels orders (compensate)",
    },
    {
      name: "payment",
      role: "service",
      description: "Processes payments (forward) / issues refunds (compensate)",
    },
    {
      name: "inventory",
      role: "service",
      description: "Reserves stock (forward) / releases stock (compensate)",
    },
    {
      name: "shipping",
      role: "service",
      description: "Schedules shipment (forward) / cancels shipment (compensate)",
    },
  ],
  tradeoffs: {
    pros: [
      "No distributed locks — each service manages its own local transaction",
      "Eventual consistency without two-phase commit overhead",
      "Clear compensation semantics make rollback predictable",
      "Works well with event-driven architectures",
    ],
    cons: [
      "Compensation logic must be written for every step (doubles implementation effort)",
      "Intermediate states are visible to other transactions (no isolation)",
      "Compensation can itself fail, requiring additional retry/dead-letter handling",
      "Debugging multi-step failures across services is complex",
    ],
  },
  suggestedScenarios: [
    {
      label: "Happy path",
      description: "3 requests — all 4 steps complete each time",
      requestCount: 3,
      requestsPerSecond: 5,
    },
    {
      label: "Inventory failure",
      description: "3 requests — inventory fails 50%, watch compensation roll back",
      requestCount: 3,
      requestsPerSecond: 3,
      failureInjection: { nodeFailures: { inventory: 0.5 } },
    },
    {
      label: "Payment always fails",
      description: "4 requests — payment 100% failure, only order gets compensated",
      requestCount: 4,
      requestsPerSecond: 3,
      failureInjection: { nodeFailures: { payment: 1.0 } },
    },
  ],
};

const cqrs: PatternContent = {
  name: "cqrs",
  icon: "📋",
  tagline: "Command/Query separation with event sourcing",
  description:
    "Separates read and write operations into different models. Commands modify state via an event store and projector. Queries read from a pre-built read model optimized for fast retrieval. This enables independent scaling — writes can be consistent while reads are eventually consistent but fast.",
  whenToUse: [
    "Systems with vastly different read vs write loads (e.g. 100:1 read:write ratio)",
    "When read and write models need different data shapes or optimizations",
    "Event sourcing architectures where you need derived read views",
    "Microservices needing independent scaling of query and command paths",
  ],
  architectureMermaid: `graph LR
    Client[Client] -->|write| CmdSvc[Command Service]
    CmdSvc --> ES[Event Store]
    ES --> Proj[Projector]
    Proj --> RM[Read Model]
    Client -->|read| QSvc[Query Service]
    QSvc --> RM`,
  howItWorks: [
    "Each request is classified as a write (command) or read (query) — the simulation uses a 50/50 split by default",
    "Write path: Client → Command Service (validates) → Event Store (appends event) → Projector (updates read model). This is the slow, consistent path.",
    "Read path: Client → Query Service → Read Model. This is the fast path — reads from pre-built projections.",
    "The Projector runs after each write, introducing a 'projection lag' between when data is written and when it's available for reads",
    "Key tradeoff: reads are fast and scalable, but may serve slightly stale data (eventual consistency)",
  ],
  nodes: [
    { name: "command-svc", role: "command-handler", description: "Validates write commands, enforces business rules" },
    { name: "event-store", role: "event-store", description: "Append-only log of all state changes (events)" },
    { name: "projector", role: "projector", description: "Reads events and builds optimized read model" },
    { name: "read-model", role: "read-model", description: "Pre-computed view optimized for fast queries" },
    { name: "query-svc", role: "query-handler", description: "Routes read queries to the read model" },
  ],
  tradeoffs: {
    pros: [
      "Independent scaling — add read replicas without touching write path",
      "Optimized data models — reads and writes use different schemas",
      "Event sourcing provides full audit trail and time-travel debugging",
      "Read path is extremely fast (pre-computed projections)",
    ],
    cons: [
      "Eventual consistency — reads may return stale data",
      "Increased complexity — two data models, event store, projector to maintain",
      "Projection lag can cause confusion (write then immediate read returns old data)",
      "Event schema evolution is difficult once events are persisted",
    ],
  },
  suggestedScenarios: [
    {
      label: "Balanced load",
      description: "8 requests — 50/50 read/write mix, observe both data paths",
      requestCount: 8,
      requestsPerSecond: 5,
    },
    {
      label: "Event store failure",
      description: "6 requests — event store fails 50%, writes fail but reads continue",
      requestCount: 6,
      requestsPerSecond: 3,
      failureInjection: { nodeFailures: { "event-store": 0.5 } },
    },
  ],
};

const loadBalancer: PatternContent = {
  name: "load-balancer",
  icon: "⚖️",
  tagline: "Request distribution across backend instances",
  description:
    "Distributes incoming requests across multiple backend instances to achieve even load, high availability, and horizontal scaling. Uses round-robin algorithm to cycle through healthy backends, automatically skipping failed instances.",
  whenToUse: [
    "Horizontal scaling — distribute traffic across multiple server instances",
    "High availability — if one backend fails, others absorb the load",
    "Even resource utilization — prevent any single instance from being overloaded",
    "Zero-downtime deployments — drain one instance while others serve traffic",
  ],
  architectureMermaid: `graph LR
    Client[Client] --> LB[Load Balancer<br/>round-robin]
    LB --> B1[Backend 1]
    LB --> B2[Backend 2]
    LB --> B3[Backend 3]
    LB --> B4[Backend 4]`,
  howItWorks: [
    "Client sends all requests to the load balancer, which acts as a single entry point",
    "The LB maintains a list of backend instances and filters out unhealthy ones",
    "Using round-robin, it cycles through healthy backends: request 1 → backend-1, request 2 → backend-2, etc.",
    "Each backend processes the request independently with its own latency and failure characteristics",
    "If a backend fails, the LB detects it and routes subsequent requests to remaining healthy instances",
  ],
  nodes: [
    { name: "lb", role: "load-balancer", description: "Distributes requests across backends using round-robin" },
    { name: "backend-1", role: "backend-instance", description: "Server instance 1 (100ms latency)" },
    { name: "backend-2", role: "backend-instance", description: "Server instance 2 (100ms latency)" },
    { name: "backend-3", role: "backend-instance", description: "Server instance 3 (100ms latency)" },
    { name: "backend-4", role: "backend-instance", description: "Server instance 4 (100ms latency)" },
  ],
  tradeoffs: {
    pros: [
      "Simple to implement and reason about (round-robin is stateless)",
      "Automatic failover — unhealthy backends are skipped",
      "Linear horizontal scaling — add more backends to handle more load",
      "No single point of failure for backends (LB itself is the SPOF)",
    ],
    cons: [
      "Round-robin ignores backend load — a slow instance gets same traffic as a fast one",
      "No session affinity — requests from same client may hit different backends",
      "LB is a single point of failure (needs its own redundancy)",
      "Doesn't account for varying request complexity or backend capacity",
    ],
  },
  suggestedScenarios: [
    {
      label: "Even distribution",
      description: "10 requests across 4 healthy backends — watch round-robin cycle",
      requestCount: 10,
      requestsPerSecond: 5,
    },
    {
      label: "Backend-3 down",
      description: "10 requests — one backend fails, remaining 3 absorb the load",
      requestCount: 10,
      requestsPerSecond: 5,
      failureInjection: { nodeFailures: { "backend-3": 1.0 } },
    },
  ],
};

const pubSub: PatternContent = {
  name: "pub-sub",
  icon: "📡",
  tagline: "Event-driven fan-out with topic routing",
  description:
    "Decouples producers from consumers via a message broker. Publishers send events to topics, and the broker fans out each message to all subscribers of that topic. Enables loose coupling, independent scaling of producers and consumers, and event-driven architectures.",
  whenToUse: [
    "Event-driven architectures where multiple services react to the same event",
    "Notification systems — one event triggers emails, push notifications, analytics",
    "Microservice integration without direct coupling between services",
    "Real-time data distribution (market data, sensor readings, chat messages)",
  ],
  architectureMermaid: `graph LR
    Pub[Publisher] -->|orders| Broker[Broker<br/>topic router]
    Broker --> S1[Subscriber 1]
    Broker --> S2[Subscriber 2]
    Broker --> S3[Subscriber 3]`,
  howItWorks: [
    "Publisher sends messages tagged with a topic (e.g., 'orders') to the broker",
    "The broker maintains a registry of which subscribers are interested in which topics",
    "For each incoming message, the broker resolves all subscribers for that topic",
    "Fan-out delivery: the broker sends the message to every matching subscriber, one by one",
    "Each subscriber processes the message independently with its own latency and failure characteristics",
  ],
  nodes: [
    { name: "publisher", role: "publisher", description: "Produces messages tagged with a topic" },
    { name: "broker", role: "message-broker", description: "Routes messages to subscribers by topic, manages fan-out" },
    { name: "sub-1", role: "subscriber", description: "Consumer 1 — processes order events (80ms)" },
    { name: "sub-2", role: "subscriber", description: "Consumer 2 — processes order events (100ms)" },
    { name: "sub-3", role: "subscriber", description: "Consumer 3 — processes order events (60ms)" },
  ],
  tradeoffs: {
    pros: [
      "Loose coupling — publishers don't know about subscribers",
      "Easy to add new subscribers without changing publishers",
      "Natural fit for event-driven and reactive architectures",
      "Independent scaling of producers and consumers",
    ],
    cons: [
      "Message ordering not guaranteed across subscribers",
      "At-least-once delivery means subscribers must handle duplicates",
      "Broker is a single point of failure (needs clustering/replication)",
      "Debugging message flow across many subscribers is complex",
    ],
  },
  suggestedScenarios: [
    {
      label: "Fan-out delivery",
      description: "5 messages fan out to all 3 subscribers — each gets every message",
      requestCount: 5,
      requestsPerSecond: 3,
    },
    {
      label: "Subscriber-2 down",
      description: "4 messages — one subscriber fails, broker delivers to the others",
      requestCount: 4,
      requestsPerSecond: 3,
      failureInjection: { nodeFailures: { "sub-2": 1.0 } },
    },
  ],
};

const bulkhead: PatternContent = {
  name: "bulkhead",
  icon: "🚧",
  tagline: "Isolated resource pools preventing cascade failures",
  description:
    "Isolates resources into separate pools — like ship bulkheads that contain flooding to one compartment. Each service gets its own thread pool with a fixed capacity. When one pool is exhausted, requests to that service are rejected while other pools remain unaffected, preventing one failing component from taking down the entire system.",
  whenToUse: [
    "Multi-tenant systems where one tenant's load shouldn't affect others",
    "Services with varying reliability — isolate unstable services from stable ones",
    "Preventing thread/connection pool exhaustion from cascading across services",
    "Complementing circuit breakers with proactive resource isolation",
  ],
  architectureMermaid: `graph LR
    Client[Client] --> GW[Gateway]
    GW --> PA[Pool A<br/>3 threads]
    GW --> PB[Pool B<br/>3 threads]
    GW --> PC[Pool C<br/>3 threads]
    PA --> SA[Service A]
    PB --> SB[Service B]
    PC --> SC[Service C]`,
  howItWorks: [
    "Gateway receives requests and routes them to the appropriate pool based on target service",
    "Each pool has a fixed maximum concurrency (e.g., 3 threads per pool)",
    "If a pool has available capacity, the request passes through to the backend service",
    "If a pool is full, the request is immediately rejected — preventing resource exhaustion",
    "Key insight: when Service A is overloaded and Pool A fills up, Pool B and Pool C are completely unaffected",
  ],
  nodes: [
    { name: "gateway", role: "gateway", description: "Routes requests to the appropriate pool based on target service" },
    { name: "pool-a", role: "thread-pool", description: "10-thread pool isolating Service A traffic" },
    { name: "pool-b", role: "thread-pool", description: "10-thread pool isolating Service B traffic" },
    { name: "pool-c", role: "thread-pool", description: "5-thread pool isolating Service C traffic" },
    { name: "service-a", role: "backend-service", description: "Backend service A (150ms latency)" },
    { name: "service-b", role: "backend-service", description: "Backend service B (100ms latency)" },
    { name: "service-c", role: "backend-service", description: "Backend service C (80ms latency)" },
  ],
  tradeoffs: {
    pros: [
      "Failure isolation — one service's problems don't cascade to others",
      "Predictable resource usage per service (no resource starvation)",
      "Graceful degradation — system partially works even under stress",
      "Easy to tune per-service capacity based on importance",
    ],
    cons: [
      "Resource underutilization — idle pools can't lend capacity to busy ones",
      "Complexity of sizing pools correctly (too small = unnecessary rejections)",
      "More configuration to manage (one pool per service boundary)",
      "Doesn't help if the overall system is underpowered",
    ],
  },
  suggestedScenarios: [
    {
      label: "Normal traffic",
      description: "6 requests — balanced load across all 3 pools, no exhaustion",
      requestCount: 6,
      requestsPerSecond: 3,
    },
    {
      label: "Service A fails",
      description: "9 requests — Service A fails, Pool A contains the blast radius, B and C unaffected",
      requestCount: 9,
      requestsPerSecond: 3,
      failureInjection: { nodeFailures: { "service-a": 1.0 } },
    },
  ],
};

const rateLimiter: PatternContent = {
  name: "rate-limiter",
  icon: "🚦",
  tagline: "Token bucket rate limiting with burst handling",
  description:
    "Controls request throughput using a token bucket algorithm. Tokens refill at a steady rate, each request consumes one token, and requests without tokens are rejected. Allows bursts up to the bucket capacity, then enforces a steady-state rate — protecting backend services from overload.",
  whenToUse: [
    "API rate limiting — enforce per-client or per-endpoint request quotas",
    "Protecting backend services from traffic spikes and DDoS",
    "Fair resource allocation across multiple consumers",
    "Smoothing bursty traffic into steady-state throughput",
  ],
  architectureMermaid: `graph LR
    Client[Client] --> RL[Rate Limiter<br/>token bucket]
    RL -->|token available| Backend[Backend Service]
    RL -.->|bucket empty| Reject[Reject 429]`,
  howItWorks: [
    "The token bucket starts full (e.g., 20 tokens). Tokens refill at a fixed rate (e.g., 10/sec)",
    "Each incoming request checks the bucket: if tokens ≥ 1, consume a token and forward to backend",
    "If the bucket is empty, the request is immediately rejected (HTTP 429 Too Many Requests)",
    "Bursts are handled naturally: a full bucket absorbs up to 20 rapid requests, then rejections begin",
    "After a burst, the bucket gradually refills — requests start being accepted again as tokens appear",
  ],
  nodes: [
    { name: "limiter", role: "rate-limiter", description: "Token bucket (20 max, 10/sec refill) that gates requests" },
    { name: "backend", role: "service", description: "Backend service protected by the rate limiter" },
  ],
  tradeoffs: {
    pros: [
      "Allows controlled bursts (unlike fixed window which resets abruptly)",
      "Simple to implement and reason about",
      "Steady-state rate is predictable and configurable",
      "Protects backend from overload while maximizing throughput",
    ],
    cons: [
      "Rejected requests are lost (no queuing or retry built in)",
      "Single token bucket doesn't differentiate request priority",
      "Bucket size tuning is tricky — too small limits bursts, too large allows overload",
      "Doesn't handle distributed rate limiting across multiple instances",
    ],
  },
  suggestedScenarios: [
    {
      label: "Under limit",
      description: "8 requests at 5 rps against 3/sec refill — all accepted from bucket",
      requestCount: 8,
      requestsPerSecond: 5,
    },
    {
      label: "Burst overload",
      description: "12 requests at 50 rps — bucket empties fast, ~50% rejected",
      requestCount: 12,
      requestsPerSecond: 50,
    },
    {
      label: "Sustained overload",
      description: "10 requests at 15 rps — steady stream exceeds refill, gradual rejections",
      requestCount: 10,
      requestsPerSecond: 15,
    },
  ],
};

export const PATTERN_CONTENT: Record<string, PatternContent> = {
  saga,
  cqrs,
  "load-balancer": loadBalancer,
  "pub-sub": pubSub,
  "circuit-breaker": circuitBreaker,
  bulkhead,
  "rate-limiter": rateLimiter,
};
