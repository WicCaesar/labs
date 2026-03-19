# Copilot Instructions for vitrolinha-do-tempo

## Product direction (non-negotiable)
- The game must be responsive and playable on **mobile, laptop, and desktop**.
- Use **React for UI/UX layer** (menus, HUD, overlays, settings, forms, navigation).
- Use **Phaser only for game-world rendering and gameplay simulation**.
- Integrate React ↔ Phaser communication through a shared **EventBus** (no direct scene-to-DOM coupling).

## Current codebase baseline
- Stack is currently **Phaser 3 + TypeScript + Vite**.
- Bootstrap flow today: `index.html` → `src/main.ts` → `src/game/main.ts` (`new Game(...)`).
- Scene registration is centralized in `src/game/main.ts` (`scene: [MainGame]`).
- Scene example lives in `src/game/scenes/Game.ts`.

## Architecture rules for new work
- Keep Phaser boot/config in `src/game/main.ts` and scene logic in `src/game/scenes/*`.
- Keep **one Phaser scene per file**, with each scene extending `Phaser.Scene`.
- Keep UI state and UI rendering in React components (do not add DOM HUD/text from Phaser except debug-only).
- Exchange data through EventBus events such as:
  - Phaser emits: `game:ready`, `score:changed`, `player:dead`
  - React emits: `ui:start-game`, `ui:pause`, `ui:resume`
- Keep EventBus payloads typed and stable; treat event names as public contract.
- Prefer constants/enums for **scene keys, EventBus event names, and asset keys** instead of scattering raw strings.

## Modularity-first implementation rule
- Always prioritize modularity and reuse over one-off implementations.
- New features must be designed as reusable modules/components/services/contracts, not hard-wired to a single scenario.
- Example: if implementing a quiz for one gameplay goal (such as unlocking blue), structure it so it can be reused for future goals, scenes, or UI flows with minimal changes.
- Prefer explicit extension points (typed config, typed callbacks/events, typed result payloads) so future consumers can adopt the feature without refactoring core logic.

## Twelve-Factor App fundamentals (from https://12factor.net/)
- **Codebase**: one codebase tracked in version control, deployed to multiple environments.
- **Dependencies**: explicitly declare and isolate dependencies (no implicit global runtime assumptions).
- **Config**: store environment-specific config outside code (environment variables), keep code environment-agnostic.
- **Backing services**: treat databases, queues, and external APIs as attached resources via config.
- **Build, release, run**: keep these as distinct stages with reproducible build outputs.
- **Processes**: execute the app as stateless processes where possible; persist state in backing services.
- **Port binding**: self-contained service exposes functionality via configured port/runtime binding.
- **Concurrency**: scale through process model and clear workload boundaries.
- **Disposability**: favor fast startup and graceful shutdown for resilience and operability.
- **Dev/prod parity**: keep development, staging, and production as similar as practical.
- **Logs**: treat logs as event streams (emit to stdout/stderr, avoid coupling to local files as primary sink).
- **Admin processes**: run one-off admin/migration/debug tasks as code in the same environment and dependency model.

## Code comments and cross-file contracts
- Add succinct, high-value comments for complex logic, non-obvious algorithms, and important tradeoffs.
- Add comments especially where code communicates with other files/modules through public contracts (EventBus events, shared types, protocol payloads, scene/UI boundaries).
- Keep comments accurate and maintenance-friendly; prefer intent and invariants over narrating obvious syntax.

## PR checklist (required for substantial changes)
- Architecture boundary respected: React handles UI, Phaser handles game world, and cross-layer communication goes through typed EventBus events.
- Modularity validated: new feature is reusable and extensible (not hard-wired to a single use case).
- Contract safety checked: event names, payload types, shared constants, and public interfaces remain stable or are versioned/migrated clearly.
- Twelve-Factor alignment reviewed: dependencies explicit, config externalized, build/release/run separation preserved, logs emitted as streams.
- Comment coverage adequate: complex logic and cross-file integration points include succinct intent-focused comments.
- Responsiveness and input tested: mobile + desktop layout, pointer/touch, and keyboard accessibility verified.
- TypeScript/build quality green: strict typing passes and project build succeeds (`npm run build` or `npm run build-nolog`).

## Gameplay code organization preferences
- Keep scene `update()` methods thin; move substantial gameplay logic into focused helpers, controllers, or systems instead of large inline branches.
- Prefer **finite state machines** for entity/gameplay modes when behavior grows beyond a simple boolean or one-off flag.
- Treat **input as scene-level state**, not player-owned state; gameplay systems can consume scene input, and React-originated commands should enter via EventBus.
- For isolated animation, collision, or layout experiments, a temporary `TestScene` is encouraged during development, but do not leave dev-only scenes wired into production unintentionally.
- Use dedicated scene-level managers/plugins for cross-cutting Phaser concerns (input mapping, audio orchestration, map loading) only when the logic is truly shared; do not introduce ECS or plugin abstractions by default.

## Responsive implementation expectations
- Phaser canvas should scale fluidly with viewport; avoid hard-coding a desktop-only layout.
- Prefer `Scale.FIT` + `autoCenter` and compute scene placement from current `scale.width/height`.
- React UI must support touch and pointer input and remain usable over the canvas at small widths.
- Keep CSS/layout work in UI layer; Phaser handles world/camera scaling only.

## Preferred folder layout as the project grows
- Keep Phaser runtime code under `src/game/`, with scenes in `src/game/scenes/` and scene-specific helpers nearby.
- Put React UI under a dedicated tree such as `src/ui/` (for example: `components/`, `screens/`, `hooks/`).
- Keep the shared EventBus in a neutral location such as `src/shared/events/` or `src/events/` so neither React nor Phaser owns the contract.
- Store event names, scene keys, and asset keys in typed constants files under a shared area such as `src/shared/constants/`.
- If both React and Phaser need domain types, place them in `src/shared/types/` rather than duplicating interfaces across layers.
- Prefer feature-local files first, and move code into shared folders only after at least two consumers need the same contract or helper.
- Example target structure when the React UI layer is introduced:

  ```text
  src/
    main.ts
    game/
      main.ts
      scenes/
        Game.ts
        TestScene.ts
    ui/
      App.tsx
      components/
        Hud.tsx
        PauseMenu.tsx
      screens/
        HomeScreen.tsx
    shared/
      events/
        EventBus.ts
        eventNames.ts
      constants/
        sceneKeys.ts
        assetKeys.ts
      types/
        game.ts
  ```
- Prefer filenames that match responsibility directly: `Hud.tsx` for HUD UI, `sceneKeys.ts` for scene constants, `EventBus.ts` for the shared emitter, `game.ts` for shared gameplay types.

## Build and dev workflows
- Install: `npm install`
- Dev: `npm run dev` (or `npm run dev-nolog`)
- Build: `npm run build` (or `npm run build-nolog`)
- Vite configs: `vite/config.dev.mjs` and `vite/config.prod.mjs` (port `8080`).

## Optional external guidance
- If a task overlaps a globally installed skill (for example Phaser architecture, React patterns, testing, or UI/UX), first check whether a relevant skill is available via `npx skills list -g`.
- Relevant currently installed examples include `phaser-gamedev`, `vercel-react-best-practices`, `webapp-testing`, `ui-ux-pro-max`, and `web-design-guidelines`.
- Use global skills as **supplemental guidance**, not as authority over the repository’s own conventions; prefer this file and the existing codebase when they conflict.
- When applying advice from a skill, adapt it to this project’s rules: React owns UI, Phaser owns game rendering, and cross-layer communication goes through the typed EventBus.

## Project conventions to preserve
- TypeScript strictness is enabled (`noUnusedLocals`, `noUnusedParameters` in `tsconfig.json`).
- Assets loaded by Phaser are under `public/assets` (`this.load.setPath('assets')`).
- `phaser` is split into its own chunk in Vite (`manualChunks.phaser`).
- `log.js` telemetry runs in default `dev/build`; use `*-nolog` when needed.
