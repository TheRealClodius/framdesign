---
id: project:desktop_agent_uipath
type: project
title: UiPath Desktop Agent
aliases:
  - Desktop Agent
  - Delegate
  - ARIA
  - UiPath Desktop Agent
  - Project Delegate
status: completed
period: 2025
client: UiPath
team:
  - person:andrei_clodius
domains:
  - AI
  - enterprise
  - automation
  - desktop-app
  - agentic-automation
  - conversational-UI
outcomes:
  - Presented at UiPath FORWARD Las Vegas October 2025 by CTO
  - First designer contributing directly to codebase at UiPath
  - Set new standard for consumer-grade interaction quality in enterprise software
---

## Overview

UiPath Desktop Agent (internally known as Project Delegate) is UiPath's desktop application agent with a chat interface that can record user actions, create repeatable automations, and act across the entire computer to complete user-prompted tasks. The final product name had not been decided during Andrei's involvement — it was internally called Project Delegate and later also referred to as ARIA. The project was presented at UiPath's FORWARD event in Las Vegas in October 2025 by the CTO.

## Context and problem

Desktop automation has traditionally required technical expertise to create scripts and workflows. Users need a way to automate repetitive tasks, delegate complex operations, and create reusable automations without writing code. Desktop Agent addresses these challenges by providing an AI-powered conversational interface that understands natural language instructions, can observe and record user actions, and execute tasks autonomously across the entire desktop environment.

## Role and scope

Andrei contributed to the early pitch and initial design phase of Desktop Agent. He presented the project to UiPath CEO Daniel Dines and created the design system based on the Autopilot UI components and agentic patterns he had already established. His scope included:

- **Design system creation**: Building the Desktop Agent design system by extending the Autopilot UI components and agentic interaction patterns into a desktop application context.
- **Design-engineering collaboration**: Working directly in the same GitHub repository as the software developers — a first at UiPath. Andrei used Cursor.ai to add Framer Motion animations for component and layout transitions, creating a consumer-oriented experience for the pitch.
- **Frictionless handoff**: Establishing what was effectively zero-friction design-to-engineering handoff by contributing code alongside developers, eliminating the traditional design-engineering gap.
- **Chat interface design**: Creating conversational UI patterns for desktop automation, including message bubbles, agent responses, and task delegation flows.
- **Component library**: Building design system components including add context buttons, subagent cards, tool call details, and recording interfaces.
- **Visual design**: Exploring color palettes, themes (light/dark), and visual language for the desktop application.
- **Observability patterns**: Creating interfaces for displaying subagent reasoning, tool calls, and debugging information.

Another team took over the project before Andrei left UiPath in January 2026.

## What was built (during Andrei's involvement)

- **Design system**: Extended Autopilot UI components into a desktop agent design system with chat interface, subagent cards, tool call observability, and recording interfaces.
- **Animated prototypes**: Framer Motion-based component and layout transitions built directly in the codebase, creating a polished, consumer-grade feel uncommon in enterprise software.
- **Chat interface**: Conversational UI for natural language task delegation and agent interaction.
- **Subagent system design**: Multi-agent architecture where specialized subagents work on specific tasks, with cards showing their progress and reasoning.
- **Tool call observability**: Detailed views showing full tool results, JSON outputs, and debugging information for subagent actions.
- **Context management**: Add context button with various visual treatments for incorporating additional information into agent tasks.
- **Theme support**: Light and dark mode implementations with consistent visual language.
- **Color studies**: Visual explorations of color palettes and brand identity for the Desktop Agent interface.

## Outcomes

Desktop Agent was presented at UiPath FORWARD in Las Vegas in October 2025 by the CTO. The project demonstrated a new approach to design-engineering collaboration at UiPath, where a designer contributed directly to the codebase — a first for the company. The consumer-oriented animation and interaction quality set a new standard for how UiPath products could feel. After Andrei's departure, another team continued development.

## What this project represents

UiPath Desktop Agent represents FRAM's expertise in:

- Pitching and shaping product vision at the executive level within a large enterprise.
- Creating design systems that extend across product families, building on existing component foundations.
- Bridging the design-engineering gap through direct codebase contribution using tools like Cursor.ai.
- Bringing consumer-grade interaction quality (Framer Motion animations, polished transitions) to enterprise software.
- Designing agent-driven desktop applications with conversational interfaces and transparent observability.
