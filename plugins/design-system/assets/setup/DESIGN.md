---
# The design system's rules. Every value lives in the design tokens `imports:` names (W3C Design
# Tokens), never here. `components:` names, by token id, the roles each component reads. Each key
# starts with its component's file name in kebab-case (Button.tsx → button-*; a route file takes its
# folder, about/page.tsx → about-page), so every component file that reads roles has a key.
version: alpha
name: <Product name>
description: <One sentence on the product's visual character. The rules and their reasons; the values are the design tokens it imports.>
imports: ./design-system/tokens/design.resolver.json
components: {}
---

# <Product name>: Design System

## Overview

<!-- The product's visual character in a paragraph. State the two sources of truth: the token files hold every value, this document holds the rules and holds no values. -->

### Reading the tokens

<!-- Where a token id is found: the resolver `imports:` names, its sets (always applied) and its modifier (the contexts, and which is the default). How an id reaches code: `colors.surface` is `bg-surface` and `var(--color-surface)`, `typography.body-md` is `text-body-md` (the whole style). The palette has no class. -->

## Colors

<!-- The palette: its generator and seeds (recorded in the tokens), and its scale anatomy. The roles by id, each with its use. Pairing rules: which text and icon roles sit on which surfaces, with the contrast each pair meets in every context. Interaction states: which roles are derived and by which rule. Contexts: what changes between them and what stays. -->

## Typography

<!-- The text styles by id, each with its use. A style is one unit; the documented borrows, if any. -->

## Layout

<!-- Spacing, breakpoints and containers by id, and when each is used. -->

## Elevation & Depth

<!-- Shadows by id, and which surfaces carry them. -->

## Shapes

<!-- Radii by id, and which components take each. -->

## Components

<!-- Each component in `components:`: what it is and why it reads the roles it reads. Add a component here and to the front matter before its code. Its `backgroundColor`, `textColor` and `typography` are the pair the contrast check measures in every context; a variant (`button-primary-hover`) states only what changes. -->

## Do's and Don'ts

<!-- The rules a reviewer checks: code reads roles, never the palette; a missing value becomes a token; no opacity or arbitrary values on roles; generated outputs are rebuilt, never edited. -->
