---
id: project:vector_watch
type: project
title: Vector Watch
aliases:
  - Vector Watch
status: shipped
period: 2014-2017
client: internal
team:
  - person:andrei_clodius
domains:
  - wearables
  - mobile
  - IoT
links:
  website: https://vectorwatch.com
---

## Overview

Vector Watch is a consumer wearable ecosystem designed to deliver a smartwatch with multi-week battery life and a coherent mobile experience. The project focused on combining industrial design, a proprietary low-power operating system, and mobile companion apps. To achieve a long-lasting battery, the watch used a monochrome display and low-energy electronics, and the software was tuned to optimize power consumption.

## Context and problem

The main value proposition for Vector Watch was an "always-on" wearable with a very long battery life. Achieving this required designing around strict constraints: a monochrome screen without anti-aliasing, low-resolution displays (300×300 px on the round Luna model and 250×200 px on the rectangular Meridian model) and only three physical buttons for interaction. These hardware limits shaped the user interface and navigation patterns and demanded an operating system that could fine-tune energy use. Early on, Andrei Clodius and industrial designer Steve Jarvis defined design values to guide decisions and ensure coherence despite these constraints.

## Role and scope

Andrei played multiple roles across the hardware, software and mobile parts of the project:

- **Industrial & UI design**: He collaborated on the watch's initial industrial design, focusing on button positioning, before external industrial designer Steve Jarvis refined the final form. He established the UI navigation for both Meridian (rectangular screen) and Luna (round screen) models, designing core watch faces and apps and overseeing OS development with a team of four firmware engineers.
- **Companion apps**: Andrei crafted the mobile experience for the iOS, Android and Windows Phone companion apps, enabling users to manage watch faces, downloads, fitness steps and notifications.
- **Platform and tools**: He played a pivotal role in the Watchmaker platform, which allowed users to create custom watch faces and utility apps, and he helped set up best practices and frameworks for third-party app development.

## What was built

- **Vector OS**: A proprietary low-energy operating system that tuned power consumption for each use case and provided always-on timekeeping. The OS supported two screen sizes and provided consistent navigation patterns across both.
- **Watch UI patterns**: Interaction models based on three physical buttons, with patterns for exploring lists, expanding/collapsing nested lists and navigating with up/down actions. Notifications were displayed as a subtle ring around the watch face, and users could filter which notifications were delivered via the companion app.
- **Companion mobile apps**: Native apps for iOS, Android and Windows Phone that managed watch faces, app downloads, fitness tracking and notifications.
- **Watchmaker platform**: A framework that enabled users and developers to build custom watch faces and utility apps, transforming Vector from a hardware product into a wearables ecosystem.
- **Wearable applications**: A suite of pre-installed watch faces and utility apps (up to ten slots on the watch) with instant installation via a custom Bluetooth Low Energy protocol.

## Outcomes

During the nearly three-year journey from seed investment to acquisition, Vector sold over 50,000 units, primarily the Luna model. The team developed significant technology, specialized knowledge and processes that Fitbit valued when acquiring Vector. The project demonstrated how a small team could create a low-power operating system, design compelling watch and mobile experiences under strict constraints, and nurture a developer ecosystem. The success of Vector Watch laid the groundwork for Andrei's later work on agentic automation and product ecosystems.

## What this project represents

Vector Watch showcases FRAM's ability to integrate industrial design with digital interaction design and platform thinking. It highlights expertise in:

- Designing products under severe hardware constraints (limited resolution, monochrome screens and button-only interaction) while preserving user experience.
- Creating a proprietary operating system and accompanying tools for a new hardware category.
- Building companion mobile apps that extend the hardware ecosystem and provide management features.
- Transitioning a hardware product into a B2C wearables platform through developer tools and user customization.

These capabilities inform FRAM's later work on mobile applications, design systems, and agent-driven experiences.
