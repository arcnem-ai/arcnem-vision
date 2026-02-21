---
title: Flutter GenUI
description: GenUI SDK — AI生成FlutterUI、ウィジェットカタログ、データバインディング、A2UIプロトコル。
---

> **ステータス:** Alpha (v0.7.0) — APIは変更される可能性が高いです。

GenUIは、テキストベースのAIエージェント会話を、リッチでインタラクティブなグラフィカルUIに変換するFlutter SDKです。テキストの壁をそのまま表示する代わりに、AIはあなたが定義したFlutterウィジェットカタログに合わせたJSON形式から、実行時に動的なウィジェットツリーを生成します。

Arcnem Visionのクライアントでは `genui: ^0.7.0` を利用しています。

---

## コアコンセプト

GenUIは、AIが利用できるFlutterウィジェットの語彙として **ウィジェットカタログ** を定義し、それを **コンテンツジェネレーター**（LLMバックエンド）に接続して動作します。ユーザーがメッセージを送ると、AIは構造化JSONを返し、SDKがそれをライブなFlutterウィジェットとして描画します。

重要な考え方:
- **Catalog**: AIが生成できるウィジェットの集合（各ウィジェットにJSONスキーマとビルダーを定義）。
- **Surface**: 描画されるUI領域。AIはサーフェスの作成・更新・削除を行えます。
- **DataModel**: リアクティブな集中ストア。ウィジェットはデータパスにバインドされ、値が変わると自動で再ビルドされます。
- **A2UI Protocol**: AIとクライアント間のJSONメッセージプロトコル（v0.8）。

---

## アーキテクチャ

GenUIは5つの主要コンポーネントで構成されます。

| コンポーネント | 役割 |
|-----------|---------|
| **GenUiConversation** | メインのファサード。会話管理とコンポーネント間オーケストレーションを担当 |
| **Catalog / CatalogItem** | AIが利用可能なウィジェット語彙を定義 |
| **DataModel** | リアクティブな集中状態ストア |
| **ContentGenerator** | LLMとの通信を抽象化するインターフェース |
| **A2uiMessageProcessor** | AIメッセージを処理し、サーフェスとDataModelを管理 |

### インタラクションサイクル

```
ユーザー入力 → GenUiConversation.sendRequest()
  → ContentGenerator が LLM を呼び出す
  → LLM が A2uiMessage をストリーム返却
  → A2uiMessageProcessor が状態 + DataModel を更新
  → GenUiSurface ウィジェットが再ビルド
  → ユーザーが生成された UI を操作
  → 操作が DataModel を更新し UiEvent を送出
  → イベントが UserUiInteractionMessage として LLM に返送
  → サイクルを繰り返す
```

---

## セットアップ

### 前提条件

- Flutter >= 3.41
- LLMプロバイダー

### インストール

```bash
cd client
flutter pub add genui
```

プロバイダー別パッケージ:

```bash
# Google Generative AI（最速でのプロトタイピング向け）
flutter pub add genui_google_generative_ai

# Firebase AI Logic（本番向け）
flutter pub add genui_firebase_ai

# A2UI server（カスタムバックエンド）
flutter pub add genui_a2ui a2a
```

---

## エージェントプロバイダー

### Google Generative AI（プロトタイピング）

```dart
final contentGenerator = GoogleGenerativeAiContentGenerator(
  catalog: catalog,
  systemInstruction: 'You are a helpful assistant.',
  modelName: 'models/gemini-2.5-flash',
  apiKey: 'YOUR_API_KEY',
);
```

### Firebase AI Logic（本番）

```dart
final contentGenerator = FirebaseAiContentGenerator(
  systemInstruction: 'You are a helpful assistant.',
  additionalTools: a2uiMessageProcessor.getTools(),
);
```

### A2UI Server（カスタムバックエンド）

```dart
final contentGenerator = A2uiContentGenerator(
  serverUrl: Uri.parse('http://localhost:8080'),
);
```

---

## ウィジェットカタログ

カタログは、AIが生成できるウィジェットを定義します。

### カスタム `CatalogItem` の作成

1. JSONスキーマを定義します。

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

2. ビルダー付きで `CatalogItem` を作成します。

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

3. カタログへ追加し、system instructionsで参照します。

```dart
final processor = A2uiMessageProcessor(
  catalogs: [
    CoreCatalogItems.asCatalog().copyWith([documentCard]),
  ],
);
```

---

## DataModel とバインディング

`DataModel` はリアクティブストアです。AIは任意のパスに値を設定でき、そのパスにバインドされたウィジェットは自動的に再ビルドされます。

```json
// 固定値
{
  "Text": {
    "text": { "literalString": "Welcome to Arcnem Vision" },
    "hint": "h1"
  }
}

// DataModel のパスにバインド
{
  "Text": {
    "text": { "path": "/user/name" }
  }
}
```

---

## 入力とイベント

生成ウィジェット内でのユーザー操作は、構造化イベントシステムを通じて取得され、AIに返送されます。

### カスタムウィジェットからイベントを送出

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

## Arcnem Vision との統合

GenUI は Arcnem Vision クライアントを次のように拡張できます。

- **動的な結果表示**: 処理ステータス、分類結果、信頼度スコアを表示するリッチな DocumentCard サーフェス。
- **インタラクティブ検索**: pgvector 類似検索の結果をクリック可能カード、並び替え可能リスト、比較ビューなどで表示。
- **会話型ドキュメント分析**: ユーザーの質問に対し、AIが生成UI（チャート、注釈付き画像、データテーブル）で応答するチャット体験。
- **フォーム生成**: コンテキストに応じて、AIがプロジェクト/デバイス設定フォームを動的に構築。

### 推奨プロバイダー

既存のGo製エージェントとInngestを活用しているため、最も適合するのは **A2UI server** アプローチです。

```dart
final contentGenerator = A2uiContentGenerator(
  serverUrl: Uri.parse(dotenv.env['AGENT_URL'] ?? 'http://localhost:8080'),
);
```

---

## APIリファレンス（主要クラス）

| クラス | 役割 |
|---|---|
| `GenUiConversation` | メインのファサード。会話管理とコンポーネント間オーケストレーションを担当 |
| `A2uiMessageProcessor` | AIメッセージを処理し、サーフェスとDataModelを管理 |
| `ContentGenerator` | LLMへの抽象インターフェース |
| `Catalog` / `CatalogItem` | ウィジェット語彙の定義 |
| `DataModel` | リアクティブな集中状態ストア |
| `GenUiSurface` | 生成UIサーフェスを描画するウィジェット |
| `A2uiMessage` | AI→UIメッセージのsealed class |
| `UserMessage` | AIへ送るユーザーのテキストメッセージ |
| `UiEvent` / `UserActionEvent` | ユーザー操作イベント |

---

## リソース

- [pub.dev — genui](https://pub.dev/packages/genui)
- [Flutter GenUI SDK Docs](https://docs.flutter.dev/ai/genui)
- [GitHub — flutter/genui](https://github.com/flutter/genui)
- [GenUI Examples](https://github.com/flutter/genui/tree/main/examples)
