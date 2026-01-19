---
id: project:autopilot_uipath
type: project
title: UiPath Autopilot
aliases:
  - Autopilot
  - UiPath Autopilot
status: ongoing
period: 2025-2026
client: UiPath
team:
  - person:andrei_clodius
domains:
  - AI
  - enterprise
  - LLM
  - agentic-automation
  - conversational-UI
---

## Overview

UiPath Autopilot is an LLM-powered assistant deeply integrated across all UiPath products, designed for enterprise environments. Autopilot enables users to interact with AI agents through conversational interfaces, specialized agent modes (Chat, Plan, Act), and deep integration with enterprise tools and data sources. The system manifests in two primary experiences: a side-chat assistant integrated throughout UiPath's product catalog, and a standalone desktop application focused on ChatGPT-like interaction with enterprise-grade security. The project focuses on context-aware agent interactions, hierarchical context stacking, and seamless integration with tools like Slack, Zoom, Workday, and other enterprise applications.

## Appearance and Interface

Autopilot typically appears as an AI assistant integrated across UiPath products, often with a chat interface that allows users to input text or images (like screenshots) to generate automations. Think of it as a conversational helper inside the software. The interface features:

- **Chat-based interaction**: A conversational interface similar to ChatGPT, with message bubbles for user inputs and agent responses
- **Multi-modal input**: Users can input text or upload images/screenshots to generate automations
- **Agent modes**: Visual mode selector for Chat (conversational interaction), Plan (structured planning), and Act (action execution) modes with smooth animated transitions
- **Tool execution interface**: When the agent performs actions, it displays tool calls and code editing capabilities with syntax highlighting
- **Dark and light themes**: The interface supports both dark and light mode themes
- **Side-chat integration**: When embedded in other UiPath products, Autopilot appears as a side panel or integrated chat component
- **Standalone desktop app**: As a standalone application, it provides a full-screen ChatGPT-like experience optimized for enterprise workflows

## Context and problem

Enterprise AI assistants need to operate within complex organizational structures, accessing context at multiple levels: individual user data, project-specific information, team knowledge, and company-wide resources. Autopilot addresses the challenge of providing agents with appropriate context while maintaining security, permissions, and organizational boundaries. The system must enable users to create specialized agents for specific tasks (like meeting summaries, self-assessments, or code editing) while grounding these agents in relevant enterprise data sources.

## Role and scope

Andrei served as Lead Product Designer on Autopilot, leading the design work for component library definition and UI agent patterns across the entire catalog of UiPath products. His scope included:

- **Component library leadership**: Defining and building the design system components including chat bubbles, tool interfaces, and agent interaction patterns used across all UiPath products integrating Autopilot.
- **UI agent patterns**: Establishing consistent agent interaction patterns and design language across the entire UiPath product catalog, ensuring coherent experiences whether Autopilot appears as a side-chat assistant or standalone application.
- **Side-chat integration**: Designing the side-chat Autopilot assistant experience that integrates seamlessly throughout UiPath's product suite, providing contextual AI assistance within existing workflows.
- **Standalone desktop app**: Creating the standalone desktop application experience focused on ChatGPT-like interaction with enterprise-grade security, enabling users to work with Autopilot as a dedicated tool.
- **Context architecture**: Designing hierarchical context stacking system that nests context from prompt level through chat history, user-defined context, project spaces, team data, and business-level information.
- **Agent modes**: Creating Chat, Plan, and Act interaction modes with smooth transitions and clear visual feedback.
- **User scenarios**: Mapping complex enterprise workflows like automated meeting follow-ups, annual self-assessments, and multi-step agent chains.
- **Integration design**: Designing authentication flows and integration patterns for enterprise tools (Slack, Zoom, Workday, Salesforce, etc.).
- **Space organization**: Creating the concept of Spaces (project folders) where conversations, snapshots, and custom prompts ground agents for specific use cases.

## What was built

- **Component library**: Comprehensive design system with reusable components for chat bubbles, tool interfaces, and agent interaction patterns, used consistently across all UiPath products integrating Autopilot.
- **UI agent patterns**: Standardized interaction patterns and design language ensuring coherent Autopilot experiences whether embedded as side-chat or used as standalone application.
- **Side-chat assistant**: Integrated Autopilot experience that appears throughout UiPath's product catalog, providing contextual AI assistance within existing workflows.
- **Standalone desktop application**: Dedicated Autopilot app with ChatGPT-like conversational interface, optimized for enterprise-grade security and organizational context.
- **Context stacking system**: Hierarchical model organizing context from broadest (Team/Business) to most specific (individual prompts), enabling agents to access appropriate information at each level.
- **Spaces architecture**: Project-based organization system where users can create Spaces with custom prompts, snapshots, and agent threads, allowing specialized agents for specific workflows.
- **Agent modes**: Three distinct interaction modes (Chat for conversation, Plan for structured planning, Act for execution) with animated transitions.
- **Integration patterns**: SSO authentication flows, desktop notifications, Slack integration, and seamless handoffs between enterprise applications.
- **User flows**: Complete scenarios for meeting follow-ups, performance reviews, and other enterprise workflows demonstrating agent capabilities.

## Outcomes

Autopilot demonstrates how LLM-powered assistants can be effectively integrated into enterprise environments, providing context-aware interactions while respecting organizational boundaries and security requirements. The project showcases design patterns for agentic automation, conversational interfaces, and enterprise AI integration.

## What this project represents

UiPath Autopilot represents FRAM's expertise in:

- Designing agent-driven products with clear interaction patterns and user control.
- Creating hierarchical context systems that enable powerful AI capabilities while maintaining organizational structure.
- Building enterprise-grade integrations that feel seamless and trustworthy.
- Mapping complex workflows into intuitive agent-based experiences.
- Developing design systems for AI-native interfaces and conversational UI components.

This work builds on FRAM's experience with agentic automation and AI-native systems, demonstrating how design can shape the future of enterprise AI interactions.
