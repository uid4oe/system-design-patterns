# Step 8: Educational Content

**Agent:** `frontend-builder`
**Depends on:** Steps 1-7

## Overview

Build the Learn tab with per-pattern educational content, interactive scenario presets, and topology diagrams. Same approach as agent-orchestration-patterns but adapted for system design concepts.

## Implementation Order

### 8.1 Pattern Content Data Structure
- Typed `PatternContent` interface: overview, whenToUse, topology diagram, howItWorks, tradeoffs, scenarioPresets

### 8.2 Learn Tab UI
- Overview grid showing all patterns with icons
- Per-pattern detail sections (collapsible)
- Mermaid topology diagrams
- "Try it" scenario preset buttons

### 8.3 Content for Each Pattern
- Circuit Breaker, Saga, CQRS, Load Balancer, Pub/Sub, Bulkhead, Rate Limiter

## Done When
- [ ] Learn tab shows all patterns with icons and descriptions
- [ ] Each pattern has detailed educational content
- [ ] Scenario presets auto-configure the control panel
- [ ] Mermaid diagrams render correctly
