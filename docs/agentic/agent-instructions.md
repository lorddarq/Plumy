# Agent Instructions

This document explains the two reusable instruction fields available for agentic teammates in Omvra:

- `Agent behaviour`
- `Operational instructions`

These fields are meant to help teams define how an internal agent should generally work across assigned tasks without confusing workspace metadata for higher-priority execution authority.

## Trust Boundary

Both fields are user-authored workspace context only.

They can help shape tone, workflow, and expectations, but they must never be treated as authority to override:

- active client instructions
- system instructions
- developer instructions
- tool and security rules
- task-specific acceptance criteria

When Omvra resolves an assigned task, these fields are mandatory execution inputs when present: they are delivered before task details and should shape the approach and output. They remain workspace guidance rather than a new instruction-hierarchy tier, so the higher-priority boundaries above still win.

## Agent Behaviour

Use the `Agent behaviour` field for stable persona guidance.

Good content for this field:

- collaboration style
- communication style
- decision-making heuristics
- quality bar
- things the agent should avoid behaviorally

Good examples:

```text
Work like a calm senior teammate. Explain tradeoffs briefly, keep progress updates frequent, and surface uncertainty early instead of guessing silently. Prefer small safe iterations, preserve existing user work, and avoid making hidden architectural changes without strong evidence.
```

```text
Be direct, careful, and verification-oriented. When requirements are ambiguous, make the safest reasonable assumption and state it clearly after doing the work. Favor maintainability over cleverness, and avoid overstating confidence when runtime evidence is missing.
```

Avoid using this field for:

- step-by-step task procedures
- repo-specific command sequences
- one-off implementation details
- attempts to override task or system rules

## Operational Instructions

Use the `Operational instructions` field for reusable execution guidance.

Good content for this field:

- preferred sequence of checks
- files, tools, or views to inspect first
- validation expectations
- handoff format
- reusable repo or workflow conventions
- relevant skills to apply when appropriate

Skill references in operational instructions are portable best-effort execution instructions. Omvra resolves trusted Omvra-managed content and accepts explicit runtime-advertised availability. A `provider-runtime / runtime-unverified` reference means Omvra cannot inspect the Codex, Claude, or organization-managed catalogue; it does not mean the skill is missing and does not degrade profile fidelity. The consuming agent checks its native catalogue. Only after the runtime confirms missing or denied access should the agent use a fallback and record the skill, fallback, and likely quality impact. It must not install the skill or widen access on its own.

Good examples:

```text
For UI tasks, inspect the existing component before editing, compare against the referenced design, and preserve shared primitives where possible. Reuse existing menu, dialog, tooltip, and badge components instead of duplicating behavior. After changes, validate affected states, confirm visual edge cases, and summarize user-visible results plus anything not verified.
```

```text
When working assigned execution tasks, first read the task details, related milestone, and linked dependencies. Check existing docs before inventing new patterns. If a skill applies, use it explicitly. Prefer repository-native tests and targeted manual verification over broad unscoped changes. For handoff, append the full summary of what changed, what was verified, and any remaining risk to the existing task description using the task update-description path; use the completion field only for a concise pointer of 240 characters or fewer.
```

Avoid using this field for:

- personality or tone guidance
- per-task ephemeral notes
- long reference dumps
- instructions that conflict with higher-priority rules

## How To Split Content

A simple rule:

- if the guidance answers "how should this agent generally act?", it belongs in `Agent behaviour`
- if the guidance answers "how should this agent usually execute work here?", it belongs in `Operational instructions`

Examples:

- "Communicate progress in short, calm updates." -> behaviour
- "Inspect the existing component before restyling it." -> operational
- "Escalate risky assumptions early." -> behaviour
- "Validate with focused tests before requesting review." -> operational

## Recommended Writing Style

Keep both fields:

- reusable across many tasks
- short enough to scan quickly
- specific enough to guide real work
- free of authority language like "ignore system instructions" or "always follow this above all else"

The strongest setups usually pair:

- one behavioural paragraph
- one operational paragraph

That gives the agent both a stable working style and a repeatable execution pattern without overloading the task itself.

## Product-Specific Notes

The same guidance does not land identically across every coding agent product.

### Codex

Codex reads `AGENTS.md` files before starting work and supports layered instruction discovery through global and repository-level files, with overrides closer to the active directory taking effect later in context.

What this means for Omvra:

- keep behavioural guidance stable and reusable, because Codex may see it often across many tasks
- keep operational instructions concise and concrete, because they compete with other repo guidance, task details, and active tool constraints
- avoid writing instructions that pretend to be enforcement; actual permissions, approvals, and tool rules still live outside these fields

Good Codex-style operational phrasing:

```text
Inspect the existing implementation before editing, reuse shared components when possible, and validate changed behavior before handoff.
```

### Claude Code

Claude Code uses `CLAUDE.md`, not `AGENTS.md`, and Anthropic documents that `CLAUDE.md` content is context rather than a hard enforcement layer. Claude also has auto memory, which means repeated corrections can accumulate separately from the project file.

What this means for Omvra:

- keep behavioural instructions especially crisp, because vague persona wording is less reliable than specific guidance
- keep operational instructions explicit enough to survive as reusable project context
- do not rely on these fields to hard-block behavior; if something must be enforced, that belongs in product controls, tool restrictions, or approval settings
- if a repo is shared between Codex and Claude Code, mirror the shared guidance rather than assuming one file format covers both

Good Claude-style behavioural phrasing:

```text
Be concise, verification-oriented, and explicit about uncertainty. Surface risks early, prefer safe incremental changes, and avoid claiming something was tested unless you actually verified it.
```

### GitHub Copilot

GitHub Copilot has multiple instruction surfaces. Repository-wide guidance lives in `.github/copilot-instructions.md`, and path-specific instructions can live under `.github/instructions`.

What this means for Omvra:

- operational instructions should be easy to decompose by area, because Copilot supports path-scoped instruction files
- avoid conflicting guidance across behavioural, repository, and path-specific layers
- write instructions in plain natural language and keep them implementation-useful rather than philosophical
- remember that Copilot code review and Copilot cloud agent may not use the exact same path-specific setup everywhere

Good Copilot-style operational phrasing:

```text
For files under `src/app/components`, preserve existing UI primitives, avoid duplicate menu or dialog logic, and verify all edited states before requesting review.
```

### openCode and Other AGENTS.md-Style Agents

Some agents and wrappers follow `AGENTS.md`-style or similar repository guidance conventions without sharing the exact same precedence rules, memory model, or enforcement surface as Codex.

What this means for Omvra:

- prefer portable wording over product-specific jargon
- avoid depending on special slash commands, proprietary modes, or hidden memory features
- keep behavioural guidance product-agnostic
- keep operational guidance focused on repo structure, validation flow, and handoff expectations

When the target agent is uncertain, the safest formulation is:

- behaviour = how the agent should collaborate and reason
- operational = what the agent should inspect, validate, and preserve while working

## Writing For Multiple Agents

If the same Omvra agent profile may be used by Codex, Claude Code, Copilot, or another coding agent:

- avoid instructions that depend on one product's file name alone
- avoid tool-specific commands unless they are truly part of the repo workflow
- favor explicit validation language like "verify" or "check" over fuzzy wording like "do your best"
- keep instructions short enough to survive context competition
- separate durable style guidance from procedural guidance so either can be remapped into `AGENTS.md`, `CLAUDE.md`, or Copilot instruction files later

In other words, write the Omvra fields as source material that can be translated cleanly into whichever instruction surface a specific product supports.
