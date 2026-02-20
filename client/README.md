# Arcnem Vision Client

Flutter app for Arcnem Vision — capture images, talk to AI agents, and browse documents through a generative UI.

## What this does

- **GenUI chat interface** — AI responses aren't text. They're rendered Flutter widgets (cards, galleries, interactive components) composed from JSON at runtime via the GenUI SDK.
- **On-device Gemma** — Intent parsing happens locally using `flutter_gemma`. Your queries are understood before they leave the phone.
- **Camera capture** — Take a photo and feed it directly into the agent pipeline.
- **Document gallery** — Browse, search, and view processed documents with their embeddings and descriptions.
- **API key auth** — Scoped to organization, project, and device.

## Stack

- Flutter + Dart
- `fpdart` for functional error handling (`Either`, `TaskEither`)
- `flutter_gemma` for on-device LLM inference
- `genui` SDK for AI-generated UI composition
- `flutter_secure_storage` for credential management
- Material Design 3 theming

## Getting started

```bash
flutter pub get
cp .env.example .env
```

Set your API URL and auth config in `.env`:

```env
API_URL=http://localhost:3000
CLIENT_ORIGIN=arcnem-vision://app
DEBUG_SEED_API_KEY=
```

```bash
flutter run -d chrome    # web
flutter run              # connected device
```

## Project structure

```
lib/
├── screens/       Auth, camera, dashboard, loading
├── services/      API client, auth, upload, document, GenUI, Gemma intent
├── catalog/       Custom widget catalog for GenUI (DocumentCard, Gallery, etc.)
├── providers/     Auth state management
└── theme/         Material Design theming
```

## Quality checks

```bash
flutter analyze
flutter test
```
