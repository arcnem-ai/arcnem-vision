import 'package:flutter_gemma/flutter_gemma.dart';
import 'package:fpdart/fpdart.dart';

const _systemPrompt = '''You are a document assistant. Classify the user's intent and respond with EXACTLY one of these formats:

INTENT: list
INTENT: list <number>
INTENT: describe <document_id>
INTENT: similar <document_id>
INTENT: help

Only output the INTENT line. No other text.''';

class GemmaService {
  InferenceModel? _model;
  InferenceChat? _chat;
  bool _initialized = false;

  bool get isInitialized => _initialized;

  TaskEither<String, Unit> initialize() {
    return TaskEither.tryCatch(() async {
      await FlutterGemma.initialize();

      if (!FlutterGemma.hasActiveModel()) {
        throw Exception(
          'No Gemma model installed. '
          'Use FlutterGemma.installModel() to install a model first.',
        );
      }

      _model = await FlutterGemma.getActiveModel(maxTokens: 256);

      _chat = await _model!.createChat(
        temperature: 0.3,
        topK: 1,
        tokenBuffer: 64,
      );

      _initialized = true;
      return unit;
    }, (error, _) => 'Failed to initialize Gemma | error: $error');
  }

  TaskEither<String, String> chat(String userMessage) {
    return TaskEither.tryCatch(() async {
      if (!_initialized || _chat == null) {
        throw Exception('Gemma not initialized');
      }

      final prompt = '$_systemPrompt\n\nUser: $userMessage';
      await _chat!.addQuery(Message(text: prompt, isUser: true));
      final response = await _chat!.generateChatResponse();

      if (response is TextResponse) {
        return response.token.trim();
      }
      return '';
    }, (error, _) => 'Gemma chat failed | error: $error');
  }

  void dispose() {
    _chat = null;
    _model = null;
    _initialized = false;
  }
}
