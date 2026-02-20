---
title: Flutter GenUI
description: GenUI SDK for AI-generated Flutter UIs — widget catalogs, data binding, rendering surfaces, and the A2UI protocol.
---

> **Status:** Alpha (v0.7.0) — API is likely to change.

GenUI is a Flutter SDK that transforms text-based AI agent conversations into rich, interactive graphical UIs. Instead of rendering walls of text, the AI generates dynamic widget trees at runtime from a JSON-based format composed against a catalog of Flutter widgets you define.

We use `genui: ^0.7.0` in the Arcnem Vision client.

---

## Core Concepts

GenUI works by defining a **widget catalog** — the vocabulary of Flutter widgets the AI is allowed to use — and connecting it to a **content generator** (an LLM backend). When the user sends a message, the AI responds with structured JSON that the SDK renders into live Flutter widgets.

Key ideas:
- **Catalog**: The set of widgets the AI can generate (each with a JSON schema and a builder).
- **Surface**: A rendered UI region. The AI can create, update, and delete surfaces.
- **DataModel**: A reactive, centralized store. Widgets bind to data paths and rebuild automatically when values change.
- **A2UI Protocol**: The JSON message protocol between AI and client (v0.8).

---

## Architecture

GenUI has five core components:

| Component | Purpose |
|-----------|---------|
| **GenUiConversation** | Primary facade — manages conversation, orchestrates components |
| **Catalog / CatalogItem** | Defines the widget vocabulary available to the AI |
| **DataModel** | Reactive centralized state store |
| **ContentGenerator** | Abstract interface for communicating with the LLM |
| **A2uiMessageProcessor** | Processes AI messages, manages surfaces and DataModel |

### Interaction Cycle

```
User Input → GenUiConversation.sendRequest()
  → ContentGenerator calls LLM
  → LLM streams A2uiMessages
  → A2uiMessageProcessor updates state + DataModel
  → GenUiSurface widgets rebuild
  → User interacts with generated UI
  → Interaction updates DataModel, dispatches UiEvent
  → Event sent back to LLM as UserUiInteractionMessage
  → Cycle repeats
```

---

## Setup

### Prerequisites

- Flutter >= 3.41
- An LLM provider

### Install

```bash
cd client
flutter pub add genui
```

For provider-specific packages:

```bash
# Google Generative AI (fastest for prototyping)
flutter pub add genui_google_generative_ai

# Firebase AI Logic (production)
flutter pub add genui_firebase_ai

# A2UI server (custom backend)
flutter pub add genui_a2ui a2a
```

---

## Agent Providers

### Google Generative AI (Prototyping)

```dart
final contentGenerator = GoogleGenerativeAiContentGenerator(
  catalog: catalog,
  systemInstruction: 'You are a helpful assistant.',
  modelName: 'models/gemini-2.5-flash',
  apiKey: 'YOUR_API_KEY',
);
```

### Firebase AI Logic (Production)

```dart
final contentGenerator = FirebaseAiContentGenerator(
  systemInstruction: 'You are a helpful assistant.',
  additionalTools: a2uiMessageProcessor.getTools(),
);
```

### A2UI Server (Custom Backend)

```dart
final contentGenerator = A2uiContentGenerator(
  serverUrl: Uri.parse('http://localhost:8080'),
);
```

---

## Widget Catalogs

Catalogs define what widgets the AI can generate.

### Creating Custom CatalogItems

1. Define the JSON schema:

```dart
final documentCardSchema = S.object(
  properties: {
    'title': S.string(description: 'Document title'),
    'imageUrl': S.string(description: 'Thumbnail URL'),
    'status': S.string(description: 'Processing status'),
    'confidence': S.number(description: 'Classification confidence 0-1'),
  },
  required: ['title', 'status'],
);
```

2. Create the `CatalogItem` with a builder:

```dart
final documentCard = CatalogItem(
  name: 'DocumentCard',
  dataSchema: documentCardSchema,
  widgetBuilder: ({
    required data,
    required id,
    required buildChild,
    required dispatchEvent,
    required context,
    required dataContext,
  }) {
    final json = data as Map<String, Object?>;
    final title = json['title'] as String;
    final status = json['status'] as String;
    final confidence = (json['confidence'] as num?)?.toDouble();

    return Card(
      child: ListTile(
        title: Text(title),
        subtitle: Text(status),
        trailing: confidence != null
            ? Text('${(confidence * 100).toStringAsFixed(0)}%')
            : null,
      ),
    );
  },
);
```

3. Add to the catalog and reference in system instructions:

```dart
final processor = A2uiMessageProcessor(
  catalogs: [
    CoreCatalogItems.asCatalog().copyWith([documentCard]),
  ],
);
```

---

## Data Model and Binding

The `DataModel` is a reactive store. The AI can set values at paths, and widgets bound to those paths rebuild automatically.

```json
// Literal value
{
  "Text": {
    "text": { "literalString": "Welcome to Arcnem Vision" },
    "hint": "h1"
  }
}

// Bound to DataModel path
{
  "Text": {
    "text": { "path": "/user/name" }
  }
}
```

---

## Input and Events

User interactions in generated widgets are captured and sent back to the AI through a structured event system.

### Dispatching Events from Custom Widgets

```dart
final actionButton = CatalogItem(
  name: 'ActionButton',
  dataSchema: S.object(
    properties: {
      'label': S.string(description: 'Button label'),
      'actionName': S.string(description: 'Action identifier'),
    },
    required: ['label', 'actionName'],
  ),
  widgetBuilder: ({
    required data,
    required id,
    required buildChild,
    required dispatchEvent,
    required context,
    required dataContext,
  }) {
    final json = data as Map<String, Object?>;
    return ElevatedButton(
      onPressed: () {
        dispatchEvent(
          UserActionEvent(
            name: json['actionName'] as String,
            sourceComponentId: id,
          ),
        );
      },
      child: Text(json['label'] as String),
    );
  },
);
```

---

## Integration with Arcnem Vision

GenUI can extend the Arcnem Vision client with:

- **Dynamic result displays**: Rich DocumentCard surfaces showing processing status, classification results, and confidence scores.
- **Interactive search**: Search result UIs from pgvector similarity queries — clickable cards, sortable lists, or comparison views.
- **Conversational document analysis**: Chat interface where users ask questions and the AI responds with generated UIs (charts, annotated images, data tables).
- **Form generation**: AI dynamically builds project/device configuration forms based on context.

### Recommended Provider

Since we already use Go-based agents with Inngest, the **A2UI server** approach is the best fit:

```dart
final contentGenerator = A2uiContentGenerator(
  serverUrl: Uri.parse(dotenv.env['AGENT_URL'] ?? 'http://localhost:8080'),
);
```

---

## API Reference (Key Classes)

| Class | Purpose |
|---|---|
| `GenUiConversation` | Primary facade — manages conversation, orchestrates components |
| `A2uiMessageProcessor` | Processes AI messages, manages surfaces and DataModel |
| `ContentGenerator` | Abstract interface to LLM |
| `Catalog` / `CatalogItem` | Widget vocabulary definition |
| `DataModel` | Reactive centralized state store |
| `GenUiSurface` | Widget that renders a generated UI surface |
| `A2uiMessage` | Sealed class for AI→UI messages |
| `UserMessage` | User's text message to the AI |
| `UiEvent` / `UserActionEvent` | User interaction events |

---

## Resources

- [pub.dev — genui](https://pub.dev/packages/genui)
- [Flutter GenUI SDK Docs](https://docs.flutter.dev/ai/genui)
- [GitHub — flutter/genui](https://github.com/flutter/genui)
- [GenUI Examples](https://github.com/flutter/genui/tree/main/examples)
