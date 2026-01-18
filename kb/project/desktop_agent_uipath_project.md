---
id: project:desktop_agent_uipath
type: project
title: UiPath Desktop Agent
aliases:
  - Desktop Agent
  - Delegate
  - UiPath Desktop Agent
status: ongoing
period: 2024-2025
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
metadata:
  code_name: Delegate
---

## Overview

UiPath Desktop Agent (code name: Delegate) is UiPath's desktop application agent with a chat interface that can record user actions, create repeatable automations, and act across the entire computer to complete user-prompted tasks. The Desktop Agent enables users to delegate complex, multi-step tasks to AI agents that can interact with applications, files, and system resources. It features a conversational interface where users can describe tasks in natural language, and the agent breaks them down into actionable steps, executes them across the desktop environment, and provides observability into its reasoning and tool calls.

## Context and problem

Desktop automation has traditionally required technical expertise to create scripts and workflows. Users need a way to automate repetitive tasks, delegate complex operations, and create reusable automations without writing code. Desktop Agent addresses these challenges by providing an AI-powered conversational interface that understands natural language instructions, can observe and record user actions, and execute tasks autonomously across the entire computer environment. The system must provide transparency into agent reasoning, support multiple specialized subagents working in parallel, and enable users to create, reuse, and modify automations through an intuitive interface.

## Role and scope

Andrei worked on Desktop Agent as part of his role at UiPath, focusing on:

- **Chat interface design**: Creating conversational UI patterns for desktop automation, including message bubbles, agent responses, and task delegation flows.
- **Component library**: Building design system components for Desktop Agent including add context buttons, subagent cards, tool call details, and recording interfaces.
- **Visual design**: Exploring color palettes, themes (light/dark), and visual language for the desktop application.
- **Internationalization**: Designing UI adaptations for different languages, including Japanese interface explorations.
- **Observability patterns**: Creating interfaces for displaying subagent reasoning, tool calls, and debugging information to help users understand what agents are doing.
- **Recording mode**: Designing the screen recording interface that allows users to record actions and create repeatable automations.
- **Automation management**: Creating interfaces for managing pre-existing recordings and callable automations (flows).

## What was built

- **Chat interface**: Conversational UI for natural language task delegation and agent interaction.
- **Recording mode**: Screen recording functionality that captures user actions and creates repeatable automations, with ability to provide additional instructions during recording.
- **Subagent system**: Multi-agent architecture where specialized subagents (like Excel Spreadsheet Assistant) work on specific tasks, with cards showing their progress and reasoning.
- **Tool call observability**: Detailed views showing full tool results, JSON outputs, and debugging information for subagent actions.
- **Context management**: Add context button with various states (idle, hover, click) and visual treatments (glow effects, sheen) for incorporating additional information into agent tasks.
- **Automation flows**: Interface for managing pre-existing recordings wrapped as single callable automations, with ability to run flows with context.
- **Theme support**: Light and dark mode implementations with consistent visual language.
- **Internationalization**: UI adaptations for different languages, demonstrated through Japanese interface explorations.
- **Color studies**: Visual explorations of color palettes and brand identity for the Desktop Agent interface.

## Outcomes

Desktop Agent demonstrates how AI-powered agents can be integrated into desktop environments to automate complex, multi-step tasks through natural language interaction. The system provides transparency through subagent cards and tool call details, enabling users to understand and debug agent behavior. The recording functionality bridges the gap between manual actions and automated workflows, allowing users to create reusable automations by demonstration.

## What this project represents

UiPath Desktop Agent represents FRAM's expertise in:

- Designing agent-driven desktop applications with conversational interfaces.
- Creating observability patterns that make AI agent reasoning transparent and debuggable.
- Building multi-agent systems where specialized subagents collaborate on complex tasks.
- Designing recording and automation interfaces that bridge manual and automated workflows.
- Creating visual design systems for desktop applications with theme support and internationalization.
- Developing component libraries for agent interaction patterns and debugging interfaces.

This work showcases how AI agents can be designed to work autonomously across desktop environments while maintaining user control, transparency, and the ability to create reusable automations through intuitive interfaces.
