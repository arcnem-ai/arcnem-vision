import 'dart:async';

import 'package:arcnem_vision_client/enums/document_intent.dart';
import 'package:arcnem_vision_client/models/document.dart';
import 'package:arcnem_vision_client/services/a2ui_builder.dart';
import 'package:arcnem_vision_client/services/document_service.dart';
import 'package:arcnem_vision_client/services/gemma_service.dart';
import 'package:arcnem_vision_client/services/intent_parser.dart';
import 'package:flutter/foundation.dart';
import 'package:genui/genui.dart';

class VisionContentGenerator implements ContentGenerator {
  final GemmaService _gemmaService;
  final DocumentService _documentService;

  final _a2uiController = StreamController<A2uiMessage>.broadcast();
  final _textController = StreamController<String>.broadcast();
  final _errorController = StreamController<ContentGeneratorError>.broadcast();
  final _isProcessingNotifier = ValueNotifier<bool>(false);

  int _surfaceCounter = 0;
  List<Document>? _lastDocumentList;

  VisionContentGenerator({
    required GemmaService gemmaService,
    DocumentService? documentService,
  }) : _gemmaService = gemmaService,
       _documentService = documentService ?? DocumentService();

  @override
  Stream<A2uiMessage> get a2uiMessageStream => _a2uiController.stream;

  @override
  Stream<String> get textResponseStream => _textController.stream;

  @override
  Stream<ContentGeneratorError> get errorStream => _errorController.stream;

  @override
  ValueListenable<bool> get isProcessing => _isProcessingNotifier;

  @override
  Future<void> sendRequest(
    ChatMessage message, {
    Iterable<ChatMessage>? history,
    A2UiClientCapabilities? clientCapabilities,
  }) async {
    switch (message) {
      case UserMessage():
        final text = message.text.trim();
        if (text.isNotEmpty) {
          await _handleUserText(text);
        }
      case UserUiInteractionMessage():
        await _handleUiInteraction(message);
      default:
        break;
    }
  }

  Future<void> _handleUserText(String text) async {
    _isProcessingNotifier.value = true;
    try {
      ParsedIntent parsed;

      if (_gemmaService.isInitialized) {
        final gemmaResult = await _gemmaService.chat(text).run();
        parsed = gemmaResult.fold(
          (_) => parseIntentFromKeywords(text),
          (response) => parseGemmaResponse(response),
        );
      } else {
        parsed = parseIntentFromKeywords(text);
      }

      await _executeIntent(parsed);
    } catch (error) {
      _emitText('Something went wrong while handling your request: $error');
    } finally {
      _isProcessingNotifier.value = false;
    }
  }

  Future<void> _handleUiInteraction(UserUiInteractionMessage message) async {
    final text = message.text.trim();
    if (text.isEmpty) return;

    // Parse the interaction text for findSimilar events
    // The UserUiInteractionMessage parts contain context from the UserActionEvent
    final parts = message.parts.whereType<DataPart>();
    for (final part in parts) {
      final data = part.data;
      if (data == null) continue;
      final name = data['name'] as String?;
      final documentId = data['documentId'] as String?;
      if (name == 'findSimilar' && documentId != null) {
        _isProcessingNotifier.value = true;
        try {
          await _executeIntent(
            ParsedIntent(
              intent: DocumentIntent.findSimilar,
              documentId: documentId,
              rawResponse: 'findSimilar:$documentId',
            ),
          );
        } finally {
          _isProcessingNotifier.value = false;
        }
        return;
      }
    }

    // Fallback: treat as text input
    await _handleUserText(text);
  }

  Future<void> _executeIntent(ParsedIntent parsed) async {
    switch (parsed.intent) {
      case DocumentIntent.listDocuments:
        await _listDocuments(limit: parsed.limit ?? 20);
      case DocumentIntent.describeDocument:
        if (parsed.documentId != null) {
          await _describeDocument(parsed.documentId!);
        } else {
          _emitText('Please specify a document ID to describe.');
        }
      case DocumentIntent.findSimilar:
        if (parsed.documentId != null) {
          await _findSimilar(parsed.documentId!);
        } else if (_lastDocumentList != null && _lastDocumentList!.isNotEmpty) {
          await _findSimilar(_lastDocumentList!.first.id);
        } else {
          _emitText('Please specify a document ID, or list documents first.');
        }
      case DocumentIntent.help:
        _emitHelp();
      case DocumentIntent.unknown:
        _emitText(
          'I didn\'t understand that. Try "show my documents", '
          '"find similar", or "help".',
        );
    }
  }

  Future<void> _listDocuments({int limit = 20}) async {
    final result = await _documentService.listDocuments(limit: limit).run();
    result.fold((error) => _emitText('Failed to load documents: $error'), (
      response,
    ) {
      _lastDocumentList = response.documents;
      if (response.documents.isEmpty) {
        _emitText('No documents found. Capture some images first!');
        return;
      }
      final surfaceId = _nextSurfaceId();
      final messages = buildDocumentListSurface(
        surfaceId,
        response.documents,
        '${response.documents.length} Documents',
      );
      for (final msg in messages) {
        _a2uiController.add(msg);
      }
    });
  }

  Future<void> _describeDocument(String id) async {
    final result = await _documentService.getDocument(id).run();
    result.fold((error) => _emitText('Failed to load document: $error'), (
      document,
    ) {
      final surfaceId = _nextSurfaceId();
      final messages = buildDocumentDetailSurface(surfaceId, document);
      for (final msg in messages) {
        _a2uiController.add(msg);
      }
    });
  }

  Future<void> _findSimilar(String id) async {
    final result = await _documentService.getSimilarDocuments(id).run();
    result.fold(
      (error) => _emitText('Failed to find similar documents: $error'),
      (matches) {
        if (matches.isEmpty) {
          _emitText('No similar documents found.');
          return;
        }
        final surfaceId = _nextSurfaceId();
        final messages = buildSimilarDocumentsSurface(surfaceId, matches);
        for (final msg in messages) {
          _a2uiController.add(msg);
        }
      },
    );
  }

  void _emitHelp() {
    _emitText(
      'I can help you explore your documents:\n'
      '- "show my documents" — list recent uploads\n'
      '- "describe <id>" — get details about a document\n'
      '- "find similar <id>" — find visually similar documents\n'
      '- Tap "Find Similar" on any card',
    );
  }

  void _emitText(String text) {
    final surfaceId = _nextSurfaceId();
    final messages = buildTextSurface(surfaceId, text);
    for (final msg in messages) {
      _a2uiController.add(msg);
    }
  }

  String _nextSurfaceId() {
    _surfaceCounter++;
    return 'surface-$_surfaceCounter';
  }

  @override
  void dispose() {
    _a2uiController.close();
    _textController.close();
    _errorController.close();
    _isProcessingNotifier.dispose();
  }
}
