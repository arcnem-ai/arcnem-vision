# Flutter GenUI SDK

> **Status:** Alpha (v0.7.0) — API is likely to change.
> **Publisher:** labs.flutter.dev (official Flutter team)
> **License:** BSD-3-Clause

GenUI is a Flutter SDK that transforms text-based AI agent conversations into rich, interactive graphical UIs. Instead of rendering walls of text, the AI generates dynamic widget trees at runtime from a JSON-based format composed against a catalog of Flutter widgets you define.

We use `genui: ^0.7.0` in the Arcnem Vision client.

---

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Architecture](#architecture)
3. [Setup](#setup)
4. [Agent Providers](#agent-providers)
5. [Widget Catalogs](#widget-catalogs)
6. [Rendering Surfaces](#rendering-surfaces)
7. [Data Model and Binding](#data-model-and-binding)
8. [Input and Events](#input-and-events)
9. [API Reference (Key Classes)](#api-reference-key-classes)
10. [Integration with Arcnem Vision](#integration-with-arcnem-vision)
11. [Logging and Debugging](#logging-and-debugging)
12. [Resources](#resources)

---

## Core Concepts

GenUI works by defining a **widget catalog** — the vocabulary of Flutter widgets the AI is allowed to use — and connecting it to a **content generator** (an LLM backend). When the user sends a message, the AI responds with structured JSON that the SDK renders into live Flutter widgets. User interactions with those widgets feed state changes back to the AI, creating a high-bandwidth feedback loop.

Key ideas:
- **Catalog**: The set of widgets the AI can generate (each with a JSON schema and a builder).
- **Surface**: A rendered UI region. The AI can create, update, and delete surfaces.
- **DataModel**: A reactive, centralized store. Widgets bind to data paths and rebuild automatically when values change.
- **A2UI Protocol**: The JSON message protocol between AI and client (v0.8).

---

## Architecture

GenUI has five core components:

### GenUiConversation

The primary facade. Manages conversation history, orchestrates the content generator and message processor, and exposes callbacks for surface lifecycle events.

### Catalog / CatalogItem

A `Catalog` is a collection of `CatalogItem` objects. Each item defines:
- A **name** the AI references (e.g., `"RiddleCard"`)
- A **data schema** (JSON Schema describing the widget's properties)
- A **widget builder** function that renders the Flutter widget

### DataModel

Centralized, observable state store. Widgets are bound to paths in this model. When data at a path changes, only the widgets depending on that path rebuild.

### ContentGenerator

Abstract interface for communicating with the LLM. Streams back `A2uiMessage` commands, text responses, and errors. Implementations exist for Firebase AI, Google Generative AI, A2UI servers, and custom backends.

### A2uiMessageProcessor

Processes `A2uiMessage` instructions from the AI:
- `beginRendering` — Start rendering a new surface
- `surfaceUpdate` — Update an existing surface's widget tree
- `dataModelUpdate` — Mutate values in the DataModel
- `deleteSurface` — Remove a surface

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
- An LLM provider (see [Agent Providers](#agent-providers))

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

### iOS / macOS Network Entitlements

If connecting to a remote AI endpoint, add to `{ios,macos}/Runner/*.entitlements`:

```xml
<dict>
  <key>com.apple.security.network.client</key>
  <true/>
</dict>
```

---

## Agent Providers

### Google Generative AI (Prototyping)

Fastest setup. Requires a Gemini API key from [Google AI Studio](https://ai.google.dev/aistudio).

```dart
import 'package:genui/genui.dart';
import 'package:genui_google_generative_ai/genui_google_generative_ai.dart';

final contentGenerator = GoogleGenerativeAiContentGenerator(
  catalog: catalog,
  systemInstruction: 'You are a helpful assistant.',
  modelName: 'models/gemini-2.5-flash',
  apiKey: 'YOUR_API_KEY',
);
```

### Firebase AI Logic (Production)

Requires a Firebase project with Gemini API enabled.

```dart
import 'package:genui_firebase_ai/genui_firebase_ai.dart';

final contentGenerator = FirebaseAiContentGenerator(
  systemInstruction: 'You are a helpful assistant.',
  additionalTools: a2uiMessageProcessor.getTools(),
);
```

Initialize Firebase in `main()`:

```dart
void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  runApp(const MyApp());
}
```

### A2UI Server (Custom Backend)

Connect to your own agent server implementing the A2UI protocol.

```dart
import 'package:genui_a2ui/genui_a2ui.dart';

final contentGenerator = A2uiContentGenerator(
  serverUrl: Uri.parse('http://localhost:8080'),
);
```

---

## Widget Catalogs

Catalogs define what widgets the AI can generate. GenUI ships with `CoreCatalogItems` for basic interactive UIs, but you'll typically define custom catalog items for your domain.

### Using the Built-in Catalog

```dart
final processor = A2uiMessageProcessor(
  catalogs: [CoreCatalogItems.asCatalog()],
);
```

### Creating Custom CatalogItems

1. Define the JSON schema for the widget's properties:

```dart
import 'package:json_schema_builder/json_schema_builder.dart';

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

3. Add to the catalog:

```dart
final processor = A2uiMessageProcessor(
  catalogs: [
    CoreCatalogItems.asCatalog().copyWith([documentCard]),
  ],
);
```

4. Reference the widget in your system instructions so the AI knows to use it:

```dart
final contentGenerator = GoogleGenerativeAiContentGenerator(
  catalog: catalog,
  systemInstruction: '''
    You are a document analysis assistant for Arcnem Vision.
    When displaying document results, use the DocumentCard component.
    Each DocumentCard has a title, status, and optional confidence score.
  ''',
  modelName: 'models/gemini-2.5-flash',
  apiKey: apiKey,
);
```

---

## Rendering Surfaces

Surfaces are the UI regions created by the AI. You manage them through callbacks on `GenUiConversation`.

### Basic Setup

```dart
class _ChatScreenState extends State<ChatScreen> {
  late final A2uiMessageProcessor _processor;
  late final GenUiConversation _conversation;
  final _surfaceIds = <String>[];

  @override
  void initState() {
    super.initState();

    _processor = A2uiMessageProcessor(
      catalogs: [CoreCatalogItems.asCatalog()],
    );

    final contentGenerator = GoogleGenerativeAiContentGenerator(
      catalog: _processor.catalogs.first,
      systemInstruction: 'You are a helpful assistant.',
      modelName: 'models/gemini-2.5-flash',
      apiKey: dotenv.env['GEMINI_API_KEY'] ?? '',
    );

    _conversation = GenUiConversation(
      a2uiMessageProcessor: _processor,
      contentGenerator: contentGenerator,
      onSurfaceAdded: (SurfaceAdded update) {
        setState(() => _surfaceIds.add(update.surfaceId));
      },
      onSurfaceDeleted: (SurfaceRemoved update) {
        setState(() => _surfaceIds.remove(update.surfaceId));
      },
    );
  }

  @override
  void dispose() {
    _conversation.dispose();
    super.dispose();
  }

  void _send(String text) {
    if (text.trim().isEmpty) return;
    _conversation.sendRequest(UserMessage.text(text));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              itemCount: _surfaceIds.length,
              itemBuilder: (context, index) {
                return GenUiSurface(
                  host: _conversation.host,
                  surfaceId: _surfaceIds[index],
                );
              },
            ),
          ),
          _buildInputBar(),
        ],
      ),
    );
  }

  Widget _buildInputBar() {
    final controller = TextEditingController();
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Row(
          children: [
            Expanded(
              child: TextField(
                controller: controller,
                decoration: const InputDecoration(
                  hintText: 'Enter a message',
                ),
              ),
            ),
            const SizedBox(width: 16),
            ElevatedButton(
              onPressed: () {
                _send(controller.text);
                controller.clear();
              },
              child: const Text('Send'),
            ),
          ],
        ),
      ),
    );
  }
}
```

---

## Data Model and Binding

The `DataModel` is a reactive store. The AI can set values at paths, and widgets bound to those paths rebuild automatically.

### AI-Generated Data Binding

The AI can bind widget properties to literal values or DataModel paths:

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

// Image binding
{
  "Image": {
    "url": { "literalString": "https://example.com/image.png" },
    "hint": "mediumFeature"
  }
}
```

When the AI sends a `dataModelUpdate` message, the DataModel is mutated and any widget bound to the changed path rebuilds.

---

## Input and Events

User interactions in generated widgets are captured and sent back to the AI through a structured event system.

### Event Flow

1. User interacts with a widget (e.g., taps a button)
2. Widget calls `dispatchEvent()` with a `UserActionEvent`
3. `GenUiSurface` injects the `surfaceId`
4. `A2uiMessageProcessor` wraps it in a `userAction` JSON envelope
5. `GenUiConversation` sends it to the AI as a `UserUiInteractionMessage`
6. AI processes the event and may respond with new UI updates

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
    final label = json['label'] as String;
    final actionName = json['actionName'] as String;

    return ElevatedButton(
      onPressed: () {
        dispatchEvent(
          UserActionEvent(
            name: actionName,
            sourceComponentId: id,
          ),
        );
      },
      child: Text(label),
    );
  },
);
```

### Sending Context with Events

You can resolve DataModel values and send them as event context:

```dart
onPressed: () {
  final resolvedContext = resolveContext(
    dataContext,
    contextDefinition,  // List of paths to resolve
  );

  dispatchEvent(
    UserActionEvent(
      name: 'submit',
      sourceComponentId: id,
      context: resolvedContext,
    ),
  );
},
```

---

## API Reference (Key Classes)

| Class | Purpose |
|---|---|
| `GenUiConversation` | Primary facade — manages conversation, orchestrates components |
| `A2uiMessageProcessor` | Processes AI messages, manages surfaces and DataModel |
| `ContentGenerator` | Abstract interface to LLM (Firebase, Google AI, A2UI, custom) |
| `Catalog` | Collection of `CatalogItem`s defining the widget vocabulary |
| `CatalogItem` | Single widget definition: name, schema, builder |
| `CatalogItemContext` | Context passed to widget builders (data, id, dispatch, etc.) |
| `CoreCatalogItems` | Built-in catalog with standard interactive widgets |
| `DataModel` | Reactive centralized state store |
| `DataContext` | Scoped view into the DataModel for relative path resolution |
| `GenUiSurface` | Widget that renders a generated UI surface |
| `GenUiHost` | Interface for hosting UI surfaces |
| `A2uiMessage` | Sealed class for AI→UI messages (`beginRendering`, `surfaceUpdate`, `dataModelUpdate`, `deleteSurface`) |
| `UserMessage` | User's text message to the AI |
| `UserUiInteractionMessage` | User's widget interaction sent to the AI |
| `UiEvent` / `UserActionEvent` | Extension types for user interaction events |
| `SurfaceAdded` / `SurfaceRemoved` / `SurfaceUpdated` | Surface lifecycle events |
| `AiTool<T>` | Base class for tools the AI can invoke |
| `GenUiFunctionDeclaration` | LLM function/tool declaration |

### Key Functions

| Function | Purpose |
|---|---|
| `configureGenUiLogging()` | Set up package-level logging |
| `genUiTechPrompt()` | Get the LLM prompt describing available UI generation tools |
| `resolveContext()` | Resolve DataModel paths for event context |
| `catalogToFunctionDeclaration()` | Convert a Catalog into an LLM function declaration |

### Key Typedefs

| Typedef | Signature |
|---|---|
| `CatalogWidgetBuilder` | `Widget Function(CatalogItemContext)` |
| `DispatchEventCallback` | `void Function(UiEvent)` |
| `ChildBuilderCallback` | `Widget Function(String id, [DataContext?])` |
| `JsonMap` | `Map<String, Object?>` |

---

## Integration with Arcnem Vision

The Arcnem Vision client currently authenticates via API key and uploads images through presigned S3 URLs. GenUI can extend this by providing:

- **Dynamic result displays**: Instead of a snackbar after upload, render rich DocumentCard surfaces showing processing status, classification results, and confidence scores.
- **Interactive search**: Let the AI generate search result UIs from pgvector similarity queries — clickable cards, sortable lists, or comparison views.
- **Conversational document analysis**: Build a chat interface where users ask questions about uploaded documents and the AI responds with generated UIs (charts, annotated images, data tables).
- **Form generation**: Let the AI dynamically build project/device configuration forms based on context.

### Recommended Provider for Arcnem Vision

Since we already use Go-based agents with Inngest, the **A2UI server** approach is the best fit. This lets the Go agents serve as the GenUI backend, keeping the AI processing server-side and consistent with existing architecture:

```dart
final contentGenerator = A2uiContentGenerator(
  serverUrl: Uri.parse(dotenv.env['AGENT_URL'] ?? 'http://localhost:8080'),
);
```

Alternatively, for rapid prototyping before the A2UI server is ready, use the Google Generative AI provider with a Gemini API key.

---

## Logging and Debugging

### Enable Logging

```dart
import 'package:logging/logging.dart';
import 'package:genui/genui.dart';

final logger = configureGenUiLogging(level: Level.ALL);

void main() async {
  logger.onRecord.listen((record) {
    debugPrint('${record.loggerName}: ${record.message}');
  });
  // ...
}
```

### Debug Catalog View

Use `DebugCatalogView` to inspect all registered catalog items and their schemas during development.

---

## Resources

- [pub.dev — genui](https://pub.dev/packages/genui)
- [Flutter GenUI SDK Docs](https://docs.flutter.dev/ai/genui)
- [Get Started Guide](https://docs.flutter.dev/ai/genui/get-started)
- [Components and Concepts](https://docs.flutter.dev/ai/genui/components)
- [Input and Events](https://docs.flutter.dev/ai/genui/input-events)
- [GitHub — flutter/genui](https://github.com/flutter/genui)
- [GenUI Examples (travel_app, simple_chat, etc.)](https://github.com/flutter/genui/tree/main/examples)
- [Blog Post — Rich and Dynamic UIs with Flutter and GenUI](https://blog.flutter.dev/rich-and-dynamic-user-interfaces-with-flutter-and-generative-ui-178405af2455)
- [Dart API Docs](https://pub.dev/documentation/genui/latest/genui/)
