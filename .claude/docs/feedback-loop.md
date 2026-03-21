# Self-Improvement Feedback Loop

## Purpose

After every implementation step, the system reflects on what happened and feeds learnings back into agent definitions, docs, and process. This creates a persistent evolution trail.

## When to Run

After completing each implementation step (or significant sub-step), before moving to the next:

1. **After agent execution completes** — review what the agent did
2. **After code review** — capture review findings
3. **After fixing issues** — capture what went wrong and why

## Feedback Loop Process

### Step 1: Reflect

Review the completed work and answer:

- **What worked well?** (patterns to repeat)
- **What was surprising or unexpected?** (gaps in docs/specs)
- **What did the agent get wrong or struggle with?** (agent definition gaps)
- **What required manual intervention?** (automation opportunities)
- **Were commits properly scoped?** (commit guideline adherence)

### Step 2: Record

Write a diary entry in `.claude/diary/YYYY-MM-DD-{step-name}.md`:

```markdown
# Diary: {Step Name}

**Date:** YYYY-MM-DD
**Agent:** {agent-name}
**Step:** {step reference}
**Duration:** {approximate}

## What Happened

{Brief summary of work done — commits, files, test count}

## What Worked Well

- {observation}

## What Went Wrong / Surprises

- {observation}

## Learnings

- {concrete takeaway}

## Changes Made (Feedback Applied)

- Updated `{file}`: {what changed and why}
```

### Step 3: Update

Apply learnings to improve future execution:

| What to update | When |
|---|---|
| Agent definitions (`.claude/agents/*.md`) | Agent missed context, made wrong assumptions, or needed guidance it didn't have |
| Step docs (`docs/steps/*.md`) | Spec was ambiguous, missing, or wrong |
| Simulation protocol (`.claude/docs/simulation-protocol.md`) | Protocol edge cases discovered |
| Commit guidelines (`.claude/docs/commit-guidelines.md`) | Commit scoping was unclear |
| CLAUDE.md | Global rules need updating |

### Step 4: Link

Update `.claude/diary/INDEX.md` with the new entry so the evolution is browsable.

## Reading the Diary

Future agents and sessions should read relevant diary entries before starting work:

- **Before starting a step:** Check if previous steps left learnings relevant to your work
- **Before using an agent:** Check if the agent definition was updated with learnings
- **When debugging:** Check if similar issues were seen before

## Evolution Tracking

The diary serves as a git-trackable record of how the system improves over time. Each entry captures:

- The state before (what the agent knew)
- What actually happened (reality)
- The delta (what changed as a result)

This means you can `git log .claude/diary/` to see the full improvement timeline.
