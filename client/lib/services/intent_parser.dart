import 'package:arcnem_vision_client/enums/document_intent.dart';

class ParsedIntent {
  final DocumentIntent intent;
  final String? documentId;
  final int? limit;
  final String rawResponse;

  const ParsedIntent({
    required this.intent,
    this.documentId,
    this.limit,
    required this.rawResponse,
  });
}

ParsedIntent parseGemmaResponse(String response) {
  final trimmed = response.trim();
  final lower = trimmed.toLowerCase();

  if (lower.startsWith('intent:')) {
    final afterPrefix = trimmed.substring(7).trim();
    final parts = afterPrefix.split(RegExp(r'\s+'));
    final intentToken = parts.isNotEmpty ? parts[0].toLowerCase() : '';

    switch (intentToken) {
      case 'list':
        int? limit;
        if (parts.length > 1) {
          limit = int.tryParse(parts[1]);
        }
        return ParsedIntent(
          intent: DocumentIntent.listDocuments,
          limit: limit,
          rawResponse: trimmed,
        );
      case 'describe':
        final docId = parts.length > 1 ? parts[1] : null;
        return ParsedIntent(
          intent: DocumentIntent.describeDocument,
          documentId: docId,
          rawResponse: trimmed,
        );
      case 'similar':
        final docId = parts.length > 1 ? parts[1] : null;
        return ParsedIntent(
          intent: DocumentIntent.findSimilar,
          documentId: docId,
          rawResponse: trimmed,
        );
      case 'help':
        return ParsedIntent(intent: DocumentIntent.help, rawResponse: trimmed);
      default:
        return ParsedIntent(
          intent: DocumentIntent.unknown,
          rawResponse: trimmed,
        );
    }
  }

  return parseIntentFromKeywords(trimmed);
}

final RegExp _uuidPattern = RegExp(
  r'[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}',
);

String? _extractUuid(String text) {
  final match = _uuidPattern.firstMatch(text);
  if (match == null) {
    return null;
  }
  return text.substring(match.start, match.end);
}

ParsedIntent parseIntentFromKeywords(String input) {
  final lower = input.toLowerCase();

  if (lower.contains('help') || lower.contains('what can')) {
    return ParsedIntent(intent: DocumentIntent.help, rawResponse: input);
  }

  if (lower.contains('similar') || lower.contains('like this')) {
    final documentId = _extractUuid(lower);
    return ParsedIntent(
      intent: DocumentIntent.findSimilar,
      documentId: documentId,
      rawResponse: input,
    );
  }

  if (lower.contains('describe') ||
      lower.contains('detail') ||
      lower.contains('about')) {
    final documentId = _extractUuid(lower);
    return ParsedIntent(
      intent: DocumentIntent.describeDocument,
      documentId: documentId,
      rawResponse: input,
    );
  }

  if (lower.contains('show') ||
      lower.contains('list') ||
      lower.contains('documents') ||
      lower.contains('photos') ||
      lower.contains('images') ||
      lower.contains('recent') ||
      lower.contains('all')) {
    return ParsedIntent(
      intent: DocumentIntent.listDocuments,
      rawResponse: input,
    );
  }

  return ParsedIntent(intent: DocumentIntent.unknown, rawResponse: input);
}
